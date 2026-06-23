const router = require('express').Router();

const authController = require('./auth.controller');
const { authMiddleware } = require('../../common/middleware/auth.middleware');
const { validateLogin, validateUpdateProfile } = require('./auth.validation');

router.post('/login', validateLogin, authController.login);
router.get('/me', authMiddleware, authController.me);
router.put('/profile', authMiddleware, validateUpdateProfile, authController.updateProfile);

module.exports = router;
