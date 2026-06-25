const router = require('express').Router();

const authRoutes = require('../modules/auth/auth.routes');
const adminDistrictRoutes = require('../modules/adminMasters/districts/routes');
const adminDropdownRoutes = require('../modules/adminMasters/dropdowns/routes');
const adminLocationRoutes = require('../modules/adminMasters/locations/routes');
const adminServiceCategoryRoutes = require('../modules/adminMasters/serviceCategories/routes');
const adminServiceCenterRoutes = require('../modules/adminMasters/serviceCenters/routes');
const adminServiceItemRoutes = require('../modules/adminMasters/serviceItems/routes');
const adminStateRoutes = require('../modules/adminMasters/states/routes');
const adminModuleRoutes = require('../modules/adminMasters/modules/routes');
const adminStatusRoutes = require('../modules/adminMasters/statuses/routes');
const dashboardRoutes = require('../modules/dashboards/dashboard.routes');
const adminStatusMasterRoutes = require('../modules/adminMasters/statusMasters/routes');
const healthRoutes = require('../modules/health/health.routes');
const menuRoutes = require('../modules/menus/menu.routes');
const {
  mobileGateEntryRoutes,
  crmGateEntryRoutes
} = require('../modules/mobileGateEntry/mobileGateEntry.routes');
const mobileJobCardRoutes = require('../modules/mobileJobCard/mobileJobCard.routes');
const roleMenuPermissionRoutes = require('../modules/roleMenuPermissions/roleMenuPermission.routes');
const roleRoutes = require('../modules/roles/role.routes');
const serviceCategoryRoutes = require('../modules/service-categories/service-category.routes');
const serviceItemRoutes = require('../modules/service-items/service-item.routes');
const userRoutes = require('../modules/users/user.routes');
const customerRoutes = require('../modules/customers/customer.routes');

const webGateEntryRoutes = require('../modules/webGateEntries/webGateEntries.routes');

router.use('/auth', authRoutes);
router.use('/admin/states', adminStateRoutes);
router.use('/admin/districts', adminDistrictRoutes);
router.use('/admin/service-categories', adminServiceCategoryRoutes);
router.use('/admin/service-items', adminServiceItemRoutes);
router.use('/admin/service-centers', adminServiceCenterRoutes);
router.use('/admin/locations', adminLocationRoutes);
router.use('/admin/dropdowns', adminDropdownRoutes);
router.use('/admin/modules', adminModuleRoutes);
router.use('/admin/statuses', adminStatusRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin/statuses', adminStatusMasterRoutes);
router.use('/health', healthRoutes);
router.use('/menus', menuRoutes);
router.use('/mobile/gate-entry', mobileGateEntryRoutes);
router.use('/mobile/job-cards', mobileJobCardRoutes);
router.use('/crm/gate-entries', crmGateEntryRoutes);
router.use('/gate-entries', webGateEntryRoutes);
router.use('/roles', roleRoutes);
router.use('/roles/:roleId/menu-permissions', roleMenuPermissionRoutes);
router.use('/service-categories', serviceCategoryRoutes);
router.use('/service-items', serviceItemRoutes);
router.use('/users', userRoutes);
router.use('/customers', customerRoutes);

module.exports = router;
