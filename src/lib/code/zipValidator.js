import JSZip from 'jszip';

// Configurable security limits (with conservative defaults per specification)
export function getZipLimits() {
  const maxZipSizeMb = parseInt(process.env.MAX_ZIP_SIZE_MB || '50', 10);
  const maxExtractSizeMb = parseInt(process.env.MAX_EXTRACT_SIZE_MB || '200', 10);
  const maxEntries = parseInt(process.env.MAX_ZIP_ENTRIES || '10000', 10);
  const maxFileSizeMb = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);

  return {
    maxZipSizeBytes: maxZipSizeMb * 1024 * 1024,
    maxExtractSizeBytes: maxExtractSizeMb * 1024 * 1024,
    maxEntries,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    maxCompressionRatio: 100, // Suspicious ratio threshold for decompression bombs
  };
}

/**
 * Checks whether a buffer contains standard ZIP header signatures.
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function hasZipMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return false;
  // Standard local file header: PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return true;
  }
  // Empty archive / end of central directory: PK\x05\x06
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x05 && buffer[3] === 0x06) {
    return true;
  }
  // Spanned / split archive: PK\x07\x08
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x07 && buffer[3] === 0x08) {
    return true;
  }
  return false;
}

/**
 * Scans a ZIP buffer for encrypted entries via local file header bitflags.
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function hasEncryptedEntries(buffer) {
  if (!buffer || buffer.length < 30) return false;
  let offset = 0;
  while (offset <= buffer.length - 30) {
    if (
      buffer[offset] === 0x50 &&
      buffer[offset + 1] === 0x4b &&
      buffer[offset + 2] === 0x03 &&
      buffer[offset + 3] === 0x04
    ) {
      const flags = buffer.readUInt16LE(offset + 6);
      if ((flags & 0x0001) !== 0) {
        return true; // General purpose bit 0 indicates encryption
      }
      const compSize = buffer.readUInt32LE(offset + 18);
      const fileNameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      offset += 30 + fileNameLen + extraLen + compSize;
    } else {
      offset++;
    }
  }
  return false;
}

/**
 * Inspects a path string for path traversal, absolute roots, drive letters, and null bytes.
 * @param {string} rawPath
 * @returns {{ isSafe: boolean, reason?: string }}
 */
export function isPathSafe(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return { isSafe: false, reason: 'Empty or invalid path' };
  }

  // Null byte injection check
  if (rawPath.includes('\0')) {
    return { isSafe: false, reason: 'Path contains prohibited null byte' };
  }

  // Windows drive letter check (e.g., C:\ or D:)
  if (/^[a-zA-Z]:/.test(rawPath)) {
    return { isSafe: false, reason: 'Path specifies an absolute drive letter' };
  }

  // Absolute Unix / root check
  if (rawPath.startsWith('/') || rawPath.startsWith('\\')) {
    return { isSafe: false, reason: 'Path specifies an absolute filesystem root' };
  }

  // Path traversal segment check (.. segments in path)
  const normalized = rawPath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (seg === '..') {
      return { isSafe: false, reason: 'Path contains parent directory traversal (..) segment' };
    }
  }

  return { isSafe: true };
}

/**
 * Validates a ZIP archive buffer against security policies and operational limits.
 *
 * Enforces:
 * - Magic bytes signature verification
 * - Archive size limits
 * - Encryption rejection
 * - Total entry count limits
 * - ZIP Slip / Directory traversal defense
 * - Symlink and special file rejection
 * - Individual file size limits
 * - Cumulative uncompressed size limits (Decompression bomb protection)
 * - Compression ratio anomaly detection
 * - Duplicate normalized path detection
 *
 * @param {Buffer} buffer
 * @param {Object} [customLimits]
 * @returns {Promise<{ isValid: boolean, entryCount: number, totalUncompressedSize: number, entries: Array<Object>, zip: JSZip }>}
 */
export async function validateZip(buffer, customLimits = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid input: source code archive must be a valid Buffer.');
  }

  if (buffer.length === 0) {
    throw new Error('Archive is empty (0 bytes). Please upload a valid source code ZIP.');
  }

  const limits = { ...getZipLimits(), ...customLimits };

  // 1. Check compressed buffer size
  if (buffer.length > limits.maxZipSizeBytes) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
    const limitMb = limits.maxZipSizeBytes / (1024 * 1024);
    throw new Error(`Archive exceeds maximum allowed upload size of ${limitMb} MB (got ${sizeMb} MB).`);
  }

  // 2. Validate magic bytes
  if (!hasZipMagicBytes(buffer)) {
    throw new Error('Invalid archive: file does not match the ZIP archive signature (magic bytes PK).');
  }

  // 3. Reject encrypted archives
  if (hasEncryptedEntries(buffer)) {
    throw new Error('Security violation: Encrypted or password-protected archives are not supported.');
  }

  // 4. Load archive into JSZip
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw new Error(`Corrupted archive: unable to parse ZIP structure (${error.message}).`);
  }

  const fileEntries = Object.entries(zip.files);
  const totalEntries = fileEntries.length;

  if (totalEntries === 0) {
    throw new Error('Archive contains no files or directories.');
  }

  // 5. Entry count limit
  if (totalEntries > limits.maxEntries) {
    throw new Error(
      `Archive contains too many entries (${totalEntries}). Maximum allowed is ${limits.maxEntries}.`
    );
  }

  // 6. Inspect every entry
  let cumulativeUncompressedSize = 0;
  const seenNormalizedPaths = new Set();
  const validEntries = [];

  for (const [entryName, entry] of fileEntries) {
    // Check both entry.name and entry.unsafeOriginalName (if JSZip sanitized it)
    const rawPathsToCheck = [entryName];
    if (entry.unsafeOriginalName && entry.unsafeOriginalName !== entryName) {
      rawPathsToCheck.push(entry.unsafeOriginalName);
    }

    for (const p of rawPathsToCheck) {
      const pathSafety = isPathSafe(p);
      if (!pathSafety.isSafe) {
        throw new Error(
          `Security violation (ZIP Slip): Prohibited entry path "${p}" (${pathSafety.reason}).`
        );
      }
    }

    // Check for symlinks or special POSIX file types
    if (entry.unixPermissions !== null && entry.unixPermissions !== undefined) {
      const fileType = entry.unixPermissions & 0o170000;
      if (fileType === 0o120000) {
        // S_IFLNK - Symbolic link
        throw new Error(`Security violation: Archive contains symbolic link "${entryName}".`);
      }
      if (fileType === 0o020000 || fileType === 0o060000) {
        // Character or Block device
        throw new Error(`Security violation: Archive contains device file "${entryName}".`);
      }
      if (fileType === 0o010000) {
        // FIFO pipe
        throw new Error(`Security violation: Archive contains FIFO pipe "${entryName}".`);
      }
    }

    // Normalize path with forward slashes, trim trailing slash for directory comparison
    const normalizedPath = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
    if (seenNormalizedPaths.has(normalizedPath.toLowerCase())) {
      throw new Error(`Security violation: Duplicate normalized path detected in archive: "${normalizedPath}".`);
    }
    seenNormalizedPaths.add(normalizedPath.toLowerCase());

    // Skip directories from size calculations
    if (entry.dir || entryName.endsWith('/')) {
      validEntries.push({
        name: normalizedPath,
        isDir: true,
        uncompressedSize: 0,
        compressedSize: 0,
      });
      continue;
    }

    const uncompressedSize = entry._data?.uncompressedSize ?? 0;
    const compressedSize = entry._data?.compressedSize ?? 0;

    // Check individual file size
    if (uncompressedSize > limits.maxFileSizeBytes) {
      const sizeMb = (uncompressedSize / (1024 * 1024)).toFixed(1);
      const limitMb = limits.maxFileSizeBytes / (1024 * 1024);
      throw new Error(
        `Entry "${entryName}" exceeds maximum file size limit of ${limitMb} MB (uncompressed: ${sizeMb} MB).`
      );
    }

    // Check cumulative size (decompression bomb protection)
    cumulativeUncompressedSize += uncompressedSize;
    if (cumulativeUncompressedSize > limits.maxExtractSizeBytes) {
      const totalMb = (cumulativeUncompressedSize / (1024 * 1024)).toFixed(1);
      const limitMb = limits.maxExtractSizeBytes / (1024 * 1024);
      throw new Error(
        `Archive cumulative uncompressed size (${totalMb} MB) exceeds safety threshold of ${limitMb} MB (decompression bomb detected).`
      );
    }

    // Check suspicious compression ratio anomaly (> 100:1 for files > 1 MB)
    if (
      compressedSize > 0 &&
      uncompressedSize > 1024 * 1024 &&
      uncompressedSize / compressedSize > limits.maxCompressionRatio
    ) {
      const ratio = (uncompressedSize / compressedSize).toFixed(1);
      throw new Error(
        `Suspicious compression ratio (${ratio}:1) on entry "${entryName}". Potential decompression bomb rejected.`
      );
    }

    validEntries.push({
      name: normalizedPath,
      isDir: false,
      uncompressedSize,
      compressedSize,
      entry,
    });
  }

  return {
    isValid: true,
    entryCount: totalEntries,
    fileCount: validEntries.filter((e) => !e.isDir).length,
    totalUncompressedSize: cumulativeUncompressedSize,
    entries: validEntries,
    zip,
  };
}

