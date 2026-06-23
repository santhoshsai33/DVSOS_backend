const { createAdminMasterService } = require('../common');

const serviceCategorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  createdById: true,
  modifiedById: true,
  createdAt: true,
  updatedAt: true
};

module.exports = createAdminMasterService({
  model: 'serviceCategory',
  tableName: 'service_categories',
  label: 'Service category',
  select: serviceCategorySelect,
  fields: [
    { name: 'name', type: 'string', required: true },
    { name: 'description', type: 'string' },
    { name: 'isActive', type: 'boolean' }
  ],
  hasIsActive: true,
  hasCreatedById: true,
  hasModifiedById: true,
  slugFrom: 'name',
  uniqueFields: [
    { fieldName: 'name', label: 'Category name' }
  ],
  searchFields: ['name', 'slug', 'description'],
  recordName: (category) => category.name
});
