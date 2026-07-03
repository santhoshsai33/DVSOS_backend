const router = require('express').Router();
const notificationController = require('./notification.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

router.use(authenticate);

router.get('/', notificationController.listNotifications);
router.patch('/read-all', notificationController.markAllNotificationsRead);
router.patch('/:id/read', notificationController.markNotificationRead);
router.post('/test-manager', roleMiddleware(['admin', 'manager']), notificationController.sendTestNotificationToManager);

module.exports = router;
