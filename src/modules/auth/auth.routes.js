const router = require('express').Router();

const authController = require('./auth.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { validateLogin } = require('./auth.validation');

router.post('/login', validateLogin, authController.login);
router.get('/me', authenticate, authController.me);

module.exports = router;
