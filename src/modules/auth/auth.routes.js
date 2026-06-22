const router = require('express').Router();

const authController = require('./auth.controller');
const { authMiddleware } = require('../../common/middleware/auth.middleware');
const { validateLogin } = require('./auth.validation');

router.post('/login', validateLogin, authController.login);
router.get('/me', authMiddleware, authController.me);

module.exports = router;
