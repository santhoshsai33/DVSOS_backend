const router = require('express').Router();

const categoryController = require('./service-category.controller');
const {
  validateIdParam,
  validateIdentifierParam,
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

router.post('/create', adminOnly, validateCategoryPayload, categoryController.createCategory);
router.put('/update/:id', adminOnly, validateIdentifierParam, validateCategoryPayload, categoryController.updateCategory);
router.get('/list', canViewServiceMasters, categoryController.listCategories);
router.get('/detail/:id', canViewServiceMasters, validateIdentifierParam, categoryController.getCategoryDetail);
router.patch('/status/:id', adminOnly, validateIdParam, validateStatusPayload, categoryController.updateCategoryStatus);

module.exports = router;
