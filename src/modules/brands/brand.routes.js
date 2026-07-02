const router = require('express').Router();

const brandController = require('./brand.controller');
const {
  validateIdParam,
  validateIdentifierParam,
  validateBrandPayload,
  validateStatusPayload
} = require('./brand.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const adminOnly = roleMiddleware(['admin']);
const canViewBrands = roleMiddleware([
  'admin',
  'crm_team',
  'crm-team',
  'manager',
  'managing_director',
  'managing-director'
]);

router.use(authenticate);

router.post('/create', adminOnly, validateBrandPayload, brandController.createBrand);
router.put('/update/:id', adminOnly, validateIdentifierParam, validateBrandPayload, brandController.updateBrand);
router.get('/list', canViewBrands, brandController.listBrands);
router.patch('/status/:id', adminOnly, validateIdParam, validateStatusPayload, brandController.updateBrandStatus);

module.exports = router;
