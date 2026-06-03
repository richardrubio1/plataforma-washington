import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const cfg = loadConfig(process.env);

buildApp()
  .then((app) => app.listen({ port: cfg.PORT, host: '0.0.0.0' }))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
