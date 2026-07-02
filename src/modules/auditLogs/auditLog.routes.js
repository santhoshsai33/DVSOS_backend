const router = require('express').Router();
const auditLogController = require('./auditLog.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

// We assume Managing Director and Admin should see audit logs
const adminOrMd = roleMiddleware(['admin', 'managing_director']);

router.use(authenticate);
router.use(adminOrMd);

router.get('/list', auditLogController.getAuditLogs);
router.get('/detail/:id', auditLogController.getAuditLogById);

module.exports = router;
