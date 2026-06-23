const { createAdminMasterService } = require('../common');

const serviceCenterSelect = {
  id: true,
  serviceCenterCode: true,
  serviceCenterName: true,
  gstNumber: true,
  contactPhone: true,
  contactEmail: true,
  logoUrl: true,
  websiteUrl: true,
  isActive: true,
  createdById: true,
  modifiedById: true,
  createdAt: true,
  updatedAt: true
};

module.exports = createAdminMasterService({
  model: 'serviceCenter',
  tableName: 'service_centers',
  label: 'Service center',
  select: serviceCenterSelect,
  fields: [
    { name: 'serviceCenterCode', type: 'string' },
    { name: 'serviceCenterName', type: 'string', required: true },
    { name: 'gstNumber', type: 'string' },
    { name: 'contactPhone', type: 'string' },
    { name: 'contactEmail', type: 'string' },
    { name: 'logoUrl', type: 'string' },
    { name: 'websiteUrl', type: 'string' },
    { name: 'isActive', type: 'boolean' }
  ],
  hasIsActive: true,
  hasCreatedById: true,
  hasModifiedById: true,
  autoGenerateCode: true,
  uniqueFields: [
    { fieldName: 'serviceCenterCode', label: 'Service center code' }
  ],
  searchFields: ['serviceCenterName', 'serviceCenterCode', 'contactPhone', 'contactEmail'],
  recordName: (serviceCenter) => serviceCenter.serviceCenterName
});
