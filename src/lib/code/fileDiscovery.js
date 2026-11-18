import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Language extension mapping
export const EXTENSION_LANGUAGE_MAP = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.sql': 'sql',
};

// Prohibited / generated directories to ignore completely
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'vendor',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  '__pycache__',
  '.next',
  '.nuxt',
  '.turbo',
  'venv',
  '.venv',
  'env',
  '.idea',
  '.vscode',
  'bin',
  'obj',
  'target',
]);

// Binary / media / generated extensions to exclude
export const EXCLUDED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.webp',
  '.mp4',
  '.mp3',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.pdf',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.class',
  '.jar',
  '.pyc',
  '.pyo',
  '.map',
  '.min.js',
  '.min.css',
  '.lock',
]);

// Ignored specific filenames (lockfiles, generated configs)
export const EXCLUDED_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'composer.lock',
  'gemfile.lock',
  '.ds_store',
  'thumbs.db',
]);

/**
 * Returns discovery limits from environment or defaults.
 */
export function getDiscoveryLimits() {
  return {
    maxSourceFiles: parseInt(process.env.MAX_SOURCE_FILES || '2000', 10),
    maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10) * 1024 * 1024,
    maxAnalysisDepth: parseInt(process.env.MAX_ANALYSIS_DEPTH || '15', 10),
  };
}

/**
 * Normalizes file path to standard forward slashes.
 * @param {string} p
 * @returns {string}
 */
export function toForwardSlashes(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Detects programming language from a file name/extension.
 * @param {string} filename
 * @returns {string} Normalized language or 'unknown'
 */
export function detectLanguage(filename) {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || 'unknown';
}

/**
 * Computes SHA-256 hash of a buffer.
 * @param {Buffer} buffer
 * @returns {string}
 */
export function computeFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Counts lines in a text string.
 * @param {string} text
 * @returns {number}
 */
export function countLines(text) {
  if (!text) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') count++;
  }
  return count;
}

/**
 * Recursively walks an extraction directory, filters out ignored directories and binaries,
 * and catalogs all eligible source files.
 *
 * @param {string} rootDir - Absolute root path of extracted directory
 * @param {Object} [customLimits]
 * @returns {{ files: Array<Object>, skipped: Array<Object>, languages: Object, totalFiles: number, totalLines: number }}
 */
export function discoverSourceFiles(rootDir, customLimits = {}) {
  const limits = { ...getDiscoveryLimits(), ...customLimits };
  const eligibleFiles = [];
  const skippedFiles = [];
  const languageCounts = {};
  let totalLines = 0;

  function walk(currentDir, currentDepth) {
    if (currentDepth > limits.maxAnalysisDepth) {
      skippedFiles.push({
        path: toForwardSlashes(path.relative(rootDir, currentDir)),
        reason: `Exceeded maximum directory depth (${limits.maxAnalysisDepth})`,
      });
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      skippedFiles.push({
        path: toForwardSlashes(path.relative(rootDir, currentDir)),
        reason: `Unable to read directory: ${err.message}`,
      });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = toForwardSlashes(path.relative(rootDir, fullPath));

      if (entry.isDirectory()) {
        // Check ignored directories
        if (IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) {
          skippedFiles.push({
            path: relativePath,
            reason: `Ignored directory (${entry.name})`,
          });
          continue;
        }
        walk(fullPath, currentDepth + 1);
      } else if (entry.isFile()) {
        const lowerName = entry.name.toLowerCase();

        // Check excluded specific filenames
        if (EXCLUDED_FILENAMES.has(lowerName)) {
          skippedFiles.push({
            path: relativePath,
            reason: `Excluded file (${entry.name})`,
          });
          continue;
        }

        // Check minified bundles
        if (lowerName.endsWith('.min.js') || lowerName.endsWith('.min.css')) {
          skippedFiles.push({
            path: relativePath,
            reason: 'Excluded minified asset bundle',
          });
          continue;
        }

        const ext = path.extname(lowerName);

        // Check excluded extensions (binaries, images, archives)
        if (EXCLUDED_EXTENSIONS.has(ext)) {
          skippedFiles.push({
            path: relativePath,
            reason: `Excluded binary/media format (${ext})`,
          });
          continue;
        }

        // Detect language
        const language = detectLanguage(lowerName);
        if (language === 'unknown') {
          skippedFiles.push({
            path: relativePath,
            reason: `Unsupported language extension (${ext || 'no extension'})`,
          });
          continue;
        }

        // Check maximum source files limit
        if (eligibleFiles.length >= limits.maxSourceFiles) {
          skippedFiles.push({
            path: relativePath,
            reason: `Skipped: reached maximum source file limit (${limits.maxSourceFiles})`,
          });
          continue;
        }

        // Check file size
        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          skippedFiles.push({
            path: relativePath,
            reason: 'Unable to stat file',
          });
          continue;
        }

        if (stat.size > limits.maxFileSizeBytes) {
          const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
          skippedFiles.push({
            path: relativePath,
            reason: `File size (${sizeMb} MB) exceeds limit (${limits.maxFileSizeBytes / (1024 * 1024)} MB)`,
          });
          continue;
        }

        // Read content to count lines and compute hash
        let contentBuffer;
        let contentText = '';
        try {
          contentBuffer = fs.readFileSync(fullPath);
          contentText = contentBuffer.toString('utf8');
        } catch (readErr) {
          skippedFiles.push({
            path: relativePath,
            reason: `Unable to read file content: ${readErr.message}`,
          });
          continue;
        }

        const lines = countLines(contentText);
        const hash = computeFileHash(contentBuffer);

        totalLines += lines;
        languageCounts[language] = (languageCounts[language] || 0) + 1;

        eligibleFiles.push({
          filePath: relativePath,
          absolutePath: fullPath,
          extension: ext,
          language,
          fileSize: stat.size,
          lineCount: lines,
          fileHash: hash,
          content: contentText,
        });
      }
    }
  }

  walk(rootDir, 1);

  return {
    files: eligibleFiles,
    skipped: skippedFiles,
    languages: languageCounts,
    totalFiles: eligibleFiles.length + skippedFiles.length,
    analyzedFiles: eligibleFiles.length,
    skippedFiles: skippedFiles.length,
    totalLines,
  };
}

