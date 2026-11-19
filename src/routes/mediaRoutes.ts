import { Router } from 'express';
import multer from 'multer';
import * as mediaController from '../controllers/mediaController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { env } from '../config/environment.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { idParam } from '../validators/common.js';
import {
  deleteMediaQuery,
  listMediaQuery,
  updateMediaSchema,
  uploadMediaSchema,
} from '../validators/mediaValidators.js';

/**
 * Files are buffered in memory and handed to the storage driver, so nothing
 * untrusted is ever written to a path derived from a client-supplied filename.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.storage.maxUploadBytes, files: 1 },
});

const router = Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.MEDIA_VIEW), validateRequest(listMediaQuery, 'query'), mediaController.list);
router.post(
  '/upload',
  uploadLimiter,
  authorize(PERMISSIONS.MEDIA_UPLOAD),
  upload.single('file'),
  validateRequest(uploadMediaSchema),
  mediaController.upload,
);
router.get(
  '/:id/references',
  authorize(PERMISSIONS.MEDIA_VIEW),
  validateRequest(idParam, 'params'),
  mediaController.references,
);
router.put(
  '/:id',
  authorize(PERMISSIONS.MEDIA_UPLOAD),
  validateRequest(idParam, 'params'),
  validateRequest(updateMediaSchema),
  mediaController.update,
);
router.delete(
  '/:id',
  authorize(PERMISSIONS.MEDIA_DELETE),
  validateRequest(idParam, 'params'),
  validateRequest(deleteMediaQuery, 'query'),
  mediaController.remove,
);

export default router;
