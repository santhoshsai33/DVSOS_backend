class AzureBlobProvider {
  constructor(config) {
    this.config = config;
    this.isConfigured = Boolean(config.connectionString && config.container);

    if (!this.isConfigured) {
      console.warn('Azure Blob storage provider is not configured yet.');
    }
  }

  async upload() {
    throw new Error('Azure Blob storage provider is planned but not implemented yet.');
  }

  async delete() {
    throw new Error('Azure Blob storage provider is planned but not implemented yet.');
  }
}

module.exports = AzureBlobProvider;
