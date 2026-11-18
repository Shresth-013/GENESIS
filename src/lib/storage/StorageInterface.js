/**
 * StorageInterface - Abstract Contract for GENESIS Storage Providers
 * Enables pluggable local disk storage vs. cloud object storage (AWS S3, Cloudflare R2, Google Cloud Storage).
 */
export class StorageInterface {
  /**
   * Save a file buffer to storage.
   * @param {string} key - Unique storage path/key (e.g. 'projects/123/srs/document.pdf')
   * @param {Buffer|Uint8Array|string} data - Content to store
   * @param {Object} options - Metadata such as contentType, originalName
   * @returns {Promise<{ key: string, uri: string, size: number, mimeType?: string }>}
   */
  async save(key, data, options = {}) {
    throw new Error('Method "save" must be implemented.');
  }

  /**
   * Retrieve a file as a Buffer.
   * @param {string} key
   * @returns {Promise<Buffer>}
   */
  async get(key) {
    throw new Error('Method "get" must be implemented.');
  }

  /**
   * Check if a file exists.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    throw new Error('Method "exists" must be implemented.');
  }

  /**
   * Delete a stored file.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    throw new Error('Method "delete" must be implemented.');
  }

  /**
   * Get an accessible URI / download path for the file.
   * @param {string} key
   * @returns {Promise<string>}
   */
  async getUri(key) {
    throw new Error('Method "getUri" must be implemented.');
  }
}

