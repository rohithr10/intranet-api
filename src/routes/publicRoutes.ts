import { Router } from 'express';
import * as contentController from '../controllers/contentController.js';
import * as newsController from '../controllers/newsController.js';
import * as optionController from '../controllers/optionController.js';
import * as serviceController from '../controllers/serviceController.js';
import * as tagController from '../controllers/tagController.js';
import * as userController from '../controllers/userController.js';
import { optionalAuth } from '../middleware/authenticate.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { publicNewsQuery, slugParam } from '../validators/newsValidators.js';
import { publicDocumentsQuery } from '../validators/contentValidators.js';
import { publicServicesQuery } from '../validators/serviceValidators.js';
import { directoryQuery } from '../validators/userValidators.js';

/**
 * Everything the portal renders for ordinary visitors.
 *
 * `optionalAuth` means a signed-in visitor may see more (services limited to
 * their role, non-public options), but nothing here ever returns a draft,
 * an unpublished item or a disabled service.
 */
const router = Router();
router.use(optionalAuth);

router.get('/news', validateRequest(publicNewsQuery, 'query'), newsController.publicList);
router.get('/news/:slug', validateRequest(slugParam, 'params'), newsController.publicDetail);
router.get('/tags', tagController.publicList);
router.get('/services', validateRequest(publicServicesQuery, 'query'), serviceController.publicList);
router.get('/documents', validateRequest(publicDocumentsQuery, 'query'), contentController.publicDocuments);
router.get('/content/:slug', validateRequest(slugParam, 'params'), contentController.publicDetail);
router.get('/directory', validateRequest(directoryQuery, 'query'), userController.directory);
router.get('/options', optionController.effective);

export default router;
