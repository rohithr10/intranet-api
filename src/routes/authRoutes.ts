import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { loginLimiter, passwordResetLimiter } from '../middleware/rateLimit.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '../validators/authValidators.js';

const router = Router();

router.post('/login', loginLimiter, validateRequest(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.post(
  '/change-password',
  authenticate,
  validateRequest(changePasswordSchema),
  authController.changePassword,
);
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateRequest(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  passwordResetLimiter,
  validateRequest(resetPasswordSchema),
  authController.resetPassword,
);

export default router;
