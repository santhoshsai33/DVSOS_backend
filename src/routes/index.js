const router = require('express').Router();

const authRoutes = require('../modules/auth/auth.routes');
const healthRoutes = require('../modules/health/health.routes');
const roleRoutes = require('../modules/roles/role.routes');
const serviceCategoryRoutes = require('../modules/service-categories/service-category.routes');
const serviceItemRoutes = require('../modules/service-items/service-item.routes');
const userRoutes = require('../modules/users/user.routes');

router.use('/auth', authRoutes);
router.use('/health', healthRoutes);
router.use('/roles', roleRoutes);
router.use('/service-categories', serviceCategoryRoutes);
router.use('/service-items', serviceItemRoutes);
router.use('/users', userRoutes);

module.exports = router;
