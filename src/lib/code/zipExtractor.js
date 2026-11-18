import fs from 'node:fs';
import path from 'node:path';
import { validateZip, getZipLimits } from './zipValidator.js';

/**
 * Returns the default base directory for temporary source code extractions.
 * @returns {string}
 */
export function getExtractionBaseDir() {
  return process.env.EXTRACTION_DIR || path.join(process.cwd(), 'data', 'extractions');
}

/**
 * Cleans up an extraction directory cleanly from disk.
 * @param {string} extractDir
 */
export function cleanupExtraction(extractDir) {
  if (!extractDir || typeof extractDir !== 'string') return;
  try {
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  } catch (err) {
    // Non-fatal cleanup warning
    console.warn(`[GENESIS] Warning: Failed to clean up temporary extraction dir ${extractDir}:`, err.message);
  }
}

/**
 * Safely extracts a validated ZIP archive into an isolated filesystem sandbox.
 *
 * Security guarantees:
 * - Pre-validates ZIP archive integrity, magic bytes, and absence of ZIP Slip / symlinks / bombs
 * - Strict canonical path resolution: guarantees every file target resides inside extractDir
 * - Bounded byte tracking: aborts extraction if cumulative extracted bytes exceed limit
 * - Atomic cleanup on failure: removes extractDir if an error occurs during extraction
 *
 * @param {Buffer} buffer - Raw ZIP file buffer
 * @param {string} submissionId - Unique ID used for directory isolation
 * @param {Object} [options]
 * @returns {Promise<{ extractDir: string, extractedFiles: Array<string>, totalBytes: number, fileCount: number }>}
 */
export async function extractZipSafely(buffer, submissionId, options = {}) {
  if (!submissionId) {
    throw new Error('Missing submissionId: cannot create isolated extraction directory.');
  }

  const limits = { ...getZipLimits(), ...options.limits };

  // Step 1: Pre-validation of ZIP buffer
  const validation = await validateZip(buffer, limits);
  const { zip } = validation;

  const baseDir = options.baseDir || getExtractionBaseDir();
  const extractDir = path.resolve(path.join(baseDir, submissionId));
  const canonicalExtractDir = extractDir.endsWith(path.sep) ? extractDir : extractDir + path.sep;

  // Ensure clean target directory
  if (fs.existsSync(extractDir)) {
    cleanupExtraction(extractDir);
  }
  fs.mkdirSync(extractDir, { recursive: true });

  const extractedFiles = [];
  let totalBytesExtracted = 0;

  try {
    for (const entryMeta of validation.entries) {
      const entryName = entryMeta.name;
      const targetPath = path.resolve(extractDir, entryName);

      // Path containment check (final defense against directory breakout)
      if (!targetPath.startsWith(canonicalExtractDir) && targetPath !== extractDir) {
        throw new Error(
          `Security violation: Target extraction path "${targetPath}" escapes extraction root "${extractDir}".`
        );
      }

      if (entryMeta.isDir) {
        fs.mkdirSync(targetPath, { recursive: true });
        continue;
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Extract file buffer from JSZip
      const fileEntry = zip.file(entryName);
      if (!fileEntry) {
        continue; // Handled by directory or skip
      }

      const fileBuffer = await fileEntry.async('nodebuffer');

      // Double check file size matches limits
      if (fileBuffer.length > limits.maxFileSizeBytes) {
        throw new Error(
          `Extracted file "${entryName}" size (${fileBuffer.length} bytes) exceeds maximum file limit.`
        );
      }

      totalBytesExtracted += fileBuffer.length;
      if (totalBytesExtracted > limits.maxExtractSizeBytes) {
        throw new Error(
          `Cumulative extracted size exceeds safety limit of ${limits.maxExtractSizeBytes} bytes.`
        );
      }

      // Write file safely
      fs.writeFileSync(targetPath, fileBuffer);
      extractedFiles.push(entryName);
    }

    return {
      extractDir,
      extractedFiles,
      totalBytes: totalBytesExtracted,
      fileCount: extractedFiles.length,
    };
  } catch (error) {
    // Clean up temporary extraction directory on failure
    cleanupExtraction(extractDir);
    throw error;
  }
}

