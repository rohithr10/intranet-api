import { Router } from 'express';
import authRoutes from './authRoutes.js';
import contentRoutes from './contentRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import mediaRoutes from './mediaRoutes.js';
import newsRoutes from './newsRoutes.js';
import optionRoutes from './optionRoutes.js';
import permissionRoutes from './permissionRoutes.js';
import publicRoutes from './publicRoutes.js';
import roleRoutes from './roleRoutes.js';
import serviceRoutes from './serviceRoutes.js';
import tagRoutes from './tagRoutes.js';
import userRoutes from './userRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/permissions', permissionRoutes);
router.use('/services', serviceRoutes);
router.use('/options', optionRoutes);
router.use('/content', contentRoutes);
router.use('/news', newsRoutes);
router.use('/tags', tagRoutes);
router.use('/media', mediaRoutes);

export default router;
