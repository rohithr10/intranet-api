import { Router } from 'express';
import * as roleController from '../controllers/roleController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { PERMISSIONS } from '../utils/permissions.js';

const router = Router();

router.get('/', authenticate, authorize(PERMISSIONS.PERMISSIONS_VIEW), roleController.permissions);

export default router;
