import { LocalDiskStorage } from './LocalDiskStorage.js';

let storageInstance = null;

/**
 * Returns the configured storage provider instance (Singleton).
 * Readily supports switching to S3Storage/CloudStorage based on process.env.STORAGE_PROVIDER.
 * @returns {import('./StorageInterface').StorageInterface}
 */
export function getStorageProvider() {
  if (!storageInstance) {
    const provider = process.env.STORAGE_PROVIDER || 'local';

    switch (provider.toLowerCase()) {
      case 'local':
        storageInstance = new LocalDiskStorage();
        break;
      default:
        // Default to local disk storage for development and local execution
        storageInstance = new LocalDiskStorage();
        break;
    }
  }

  return storageInstance;
}

