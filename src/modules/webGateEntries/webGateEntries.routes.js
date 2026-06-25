const router = require('express').Router();
const controller = require('./webGateEntries.controller');
const { authMiddleware } = require('../../common/middleware/auth.middleware');

router.use(authMiddleware);

router.get('/list', controller.list);
router.get('/view/:slug', controller.getBySlug);

module.exports = router;
