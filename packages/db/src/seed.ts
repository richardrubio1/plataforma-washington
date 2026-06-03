import { createDb } from './client.js';
import { users } from './schema/auth.js';
import { workspaces } from './schema/hub.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const { db, queryClient } = createDb(DATABASE_URL);

async function seed() {
  console.log('🌱 Seeding database...');

  // Workspace sede
  const [sede] = await db
    .insert(workspaces)
    .values({
      name: 'Academia Washington — Sede',
      slug: 'sede',
      active: true,
    })
    .onConflictDoNothing()
    .returning();

  console.log('✅ Workspace sede criado:', sede?.id);

  // Admin da franqueadora
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash('admin123', 10);

  const [admin] = await db
    .insert(users)
    .values({
      email: 'admin@academiawashington.com.br',
      passwordHash,
      name: 'Administrador Washington',
      role: 'franqueadora_admin',
      workspaceId: null,
      active: true,
    })
    .onConflictDoNothing()
    .returning();

  console.log('✅ Admin criado:', admin?.email);
  console.log('🎉 Seed concluído!');

  await queryClient.end();
}

seed().catch((err) => {
  console.error('❌ Seed falhou:', err);
  process.exit(1);
});
