import os from 'node:os';
import path from 'node:path';

// Must be set before config/environment.ts reads the environment: it switches
// the database to MONGODB_URI_TEST and lowers the bcrypt cost for speed.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI_TEST ??= 'mongodb://127.0.0.1:27017/intranet_test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/intranet';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-1234567890';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-1234567890';

// Upload tests write real files; keep them out of the project's upload folder.
process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), 'intranet-test-uploads');
