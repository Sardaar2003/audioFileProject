const router = require('express').Router();
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
  uploadFolder,
  getMyUploads,
  getTextContent,
  saveEditedText,
} = require('../controllers/uploadController');
const { ROLES } = require('../constants/roles');

router.post(
  '/folder',
  authMiddleware,
  roleMiddleware(ROLES.USER, ROLES.ADMIN, ROLES.QA_MANAGER),
  upload.array('files'),
  uploadFolder
);

router.get('/mine', authMiddleware, getMyUploads);
router.get('/text/:filePairId', authMiddleware, getTextContent);
router.put('/text/:filePairId', authMiddleware, saveEditedText);

module.exports = router;


