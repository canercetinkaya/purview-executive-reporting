import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createAuthMiddleware } from './auth/middleware.js';
import { loadEnv, type AppEnv } from './config/env.js';
import { logEvent } from './observability/logger.js';
import { createRepository, type IPortalRepository } from './persistence/repository.js';
import { createApiRouter } from './routes/api.js';

export interface AppInstance {
  app: express.Express;
  repo: IPortalRepository;
  env: AppEnv;
}

export function createApp(customEnv?: AppEnv, customRepo?: IPortalRepository): AppInstance {
  const env = customEnv ?? loadEnv();
  const repo = customRepo ?? createRepository(env);
  const app = express();

  const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('CORS origin not allowed'));
      },
      credentials: true,
    }),
  );
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'purview-executive-reporting-api',
      provider: repo.mode,
      authMode: env.AUTH_MODE,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req, res) => {
    try {
      const ok = await repo.healthCheck();
      if (!ok) {
        res.status(503).json({ status: 'degraded' });
        return;
      }
      res.json({ status: 'ready', provider: repo.mode });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const authenticate = createAuthMiddleware(env);
  app.use('/api/v1', authenticate, createApiRouter(repo));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    logEvent('error', 'Unhandled API error', { message });
    if (message === 'CORS origin not allowed') {
      res.status(403).json({ error: 'CORS_FORBIDDEN', message });
      return;
    }
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : message,
    });
  });

  return { app, repo, env };
}
