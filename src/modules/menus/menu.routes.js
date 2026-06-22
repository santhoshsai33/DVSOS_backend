const router = require('express').Router();

const menuController = require('./menu.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const adminOnly = roleMiddleware(['admin']);

router.use(authenticate);
router.use(adminOnly);

router.get('/list', menuController.listMenus);
router.get('/modules/list', menuController.listMenuModules);
router.get('/list-by-module/:module', menuController.listMenusByModule);

module.exports = router;
