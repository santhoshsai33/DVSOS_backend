const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AzureBlobProvider {
  constructor(config) {
    this.config = config;
    this.isConfigured = Boolean(config.connectionString && config.container);

    if (!this.isConfigured) {
      console.warn('Azure Blob storage provider is not configured yet.');
      return;
    }

    this.blobServiceClient = BlobServiceClient.fromConnectionString(config.connectionString);
    this.containerClient = this.blobServiceClient.getContainerClient(config.container);
  }

  async upload(filePath, options = {}) {
    if (!this.isConfigured) {
      throw new Error('Azure Blob storage provider is not configured.');
    }

    const extension = options.originalName ? path.extname(options.originalName) : path.extname(filePath);
    const uniqueName = uuidv4() + extension;
    const blobName = options.folder ? `${options.folder}/${uniqueName}` : uniqueName;

    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    const mimeType = options.mimeType || 'application/octet-stream';
    const blobOptions = {
      blobHTTPHeaders: {
        blobContentType: mimeType
      }
    };

    const fileBuffer = await fs.readFile(filePath);
    await blockBlobClient.uploadData(fileBuffer, blobOptions);
    
    const size = options.size || fileBuffer.length;

    return {
      secure_url: blockBlobClient.url,
      url: blockBlobClient.url,
      public_id: blobName,
      format: extension.replace('.', '') || null,
      bytes: size
    };
  }

  async delete(publicId, options = {}) {
    if (!this.isConfigured) {
      throw new Error('Azure Blob storage provider is not configured.');
    }

    const blockBlobClient = this.containerClient.getBlockBlobClient(publicId);
    await blockBlobClient.deleteIfExists();
    return { result: 'ok' };
  }
}

module.exports = AzureBlobProvider;
