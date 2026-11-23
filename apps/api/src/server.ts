import { createApp } from './app.js';
import { logEvent } from './observability/logger.js';

const { app, env, repo } = createApp();

app.listen(env.PORT, () => {
  logEvent('info', 'Purview Executive Reporting API started', {
    port: env.PORT,
    dataProvider: repo.mode,
    authMode: env.AUTH_MODE,
    secretProvider: env.SECRET_PROVIDER,
  });
});
