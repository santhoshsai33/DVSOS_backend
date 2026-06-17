const router = require('express').Router();

const categoryController = require('./service-category.controller');
const {
  validateIdParam,
  validateCategoryPayload,
  validateStatusPayload
} = require('./service-category.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const canViewServiceMasters = roleMiddleware([
  'admin',
  'crm_team',
  'crm-team',
  'manager',
  'managing_director',
  'managing-director'
]);
const adminOnly = roleMiddleware(['admin']);

router.use(authenticate);

router.post('/', adminOnly, validateCategoryPayload, categoryController.createCategory);
router.put('/:id', adminOnly, validateIdParam, validateCategoryPayload, categoryController.updateCategory);
router.get('/', canViewServiceMasters, categoryController.listCategories);
router.get('/:id', canViewServiceMasters, validateIdParam, categoryController.getCategoryDetail);
router.patch('/:id/status', adminOnly, validateIdParam, validateStatusPayload, categoryController.updateCategoryStatus);

module.exports = router;
