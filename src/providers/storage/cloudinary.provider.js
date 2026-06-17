const cloudinary = require('cloudinary').v2;

class CloudinaryProvider {
  constructor(config) {
    this.config = config;
    this.isConfigured = Boolean(config.cloudName && config.apiKey && config.apiSecret);

    if (!this.isConfigured) {
      console.warn('Cloudinary storage provider is not fully configured.');
      return;
    }

    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret
    });
  }

  async upload(filePath, options = {}) {
    if (!this.isConfigured) {
      throw new Error('Cloudinary storage provider is not configured.');
    }

    return cloudinary.uploader.upload(filePath, options);
  }

  async delete(publicId, options = {}) {
    if (!this.isConfigured) {
      throw new Error('Cloudinary storage provider is not configured.');
    }

    return cloudinary.uploader.destroy(publicId, options);
  }
}

module.exports = CloudinaryProvider;
