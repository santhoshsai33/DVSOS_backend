const router = require('express').Router();

const authRoutes = require('../modules/auth/auth.routes');
const adminDistrictRoutes = require('../modules/adminMasters/districts/routes');
const adminDropdownRoutes = require('../modules/adminMasters/dropdowns/routes');
const adminLocationRoutes = require('../modules/adminMasters/locations/routes');
const adminServiceCategoryRoutes = require('../modules/adminMasters/serviceCategories/routes');
const adminServiceCenterRoutes = require('../modules/adminMasters/serviceCenters/routes');
const adminServiceItemRoutes = require('../modules/adminMasters/serviceItems/routes');
const adminStateRoutes = require('../modules/adminMasters/states/routes');
const healthRoutes = require('../modules/health/health.routes');
const menuRoutes = require('../modules/menus/menu.routes');
const roleMenuPermissionRoutes = require('../modules/roleMenuPermissions/roleMenuPermission.routes');
const roleRoutes = require('../modules/roles/role.routes');
const serviceCategoryRoutes = require('../modules/service-categories/service-category.routes');
const serviceItemRoutes = require('../modules/service-items/service-item.routes');
const userRoutes = require('../modules/users/user.routes');

router.use('/auth', authRoutes);
router.use('/admin/states', adminStateRoutes);
router.use('/admin/districts', adminDistrictRoutes);
router.use('/admin/service-categories', adminServiceCategoryRoutes);
router.use('/admin/service-items', adminServiceItemRoutes);
router.use('/admin/service-centers', adminServiceCenterRoutes);
router.use('/admin/locations', adminLocationRoutes);
router.use('/admin/dropdowns', adminDropdownRoutes);
router.use('/health', healthRoutes);
router.use('/menus', menuRoutes);
router.use('/roles', roleRoutes);
router.use('/roles/:roleId/menu-permissions', roleMenuPermissionRoutes);
router.use('/service-categories', serviceCategoryRoutes);
router.use('/service-items', serviceItemRoutes);
router.use('/users', userRoutes);

module.exports = router;
