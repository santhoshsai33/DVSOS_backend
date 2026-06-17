const env = require('../../config/env');
const CloudinaryProvider = require('./cloudinary.provider');
const AzureBlobProvider = require('./azure-blob.provider');

const createStorageProvider = () => {
  if (env.storageProvider === 'azure') {
    return new AzureBlobProvider(env.azureBlob);
  }

  return new CloudinaryProvider(env.cloudinary);
};

module.exports = {
  createStorageProvider
};
