import type { AuthContext } from './domain.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`; absent on anonymous requests. */
      auth?: AuthContext;
      /** Set by multer on upload routes. */
      file?: Express.Multer.File;
    }
  }
}

export {};
