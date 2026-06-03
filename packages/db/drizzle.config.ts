import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  schemaFilter: [
    'auth',
    'hub',
    'escolar',
    'conteudo',
    'progresso',
    'loja',
    'indicacoes',
    'financeiro',
  ],
} satisfies Config;
