import fs from 'node:fs';
import path from 'node:path';
import { StorageInterface } from './StorageInterface.js';

/**
 * LocalDiskStorage - Concrete Local Filesystem Implementation
 * Validates keys to prevent path traversal vulnerabilities.
 */
export class LocalDiskStorage extends StorageInterface {
  /**
   * @param {string} [baseDir]
   */
  constructor(baseDir = process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), 'data', 'storage')) {
    super();
    this.baseDir = path.resolve(baseDir);
    this._ensureBaseDir();
  }

  _ensureBaseDir() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Resolves and verifies that a key does not escape baseDir (Path Traversal Guard).
   * @param {string} key
   * @returns {string} Safe absolute path
   */
  _resolveSafePath(key) {
    // Strip leading slashes and drive letters
    const sanitizedKey = key.replace(/^[/\\]+/, '').replace(/^[a-zA-Z]:/, '');
    const targetPath = path.resolve(this.baseDir, sanitizedKey);

    if (!targetPath.startsWith(this.baseDir)) {
      throw new Error(`Security Exception: Path traversal detected for key "${key}"`);
    }

    return targetPath;
  }

  async save(key, data, options = {}) {
    const targetPath = this._resolveSafePath(key);
    const parentDir = path.dirname(targetPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await fs.promises.writeFile(targetPath, buffer);

    return {
      key,
      uri: `file://${targetPath}`,
      size: buffer.length,
      mimeType: options.mimeType || 'application/octet-stream',
    };
  }

  async get(key) {
    const targetPath = this._resolveSafePath(key);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`File not found: ${key}`);
    }
    return await fs.promises.readFile(targetPath);
  }

  async exists(key) {
    const targetPath = this._resolveSafePath(key);
    return fs.existsSync(targetPath);
  }

  async delete(key) {
    const targetPath = this._resolveSafePath(key);
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
      return true;
    }
    return false;
  }

  async getUri(key) {
    const targetPath = this._resolveSafePath(key);
    return targetPath;
  }
}

