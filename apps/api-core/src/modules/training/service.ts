import {
  trainingLessons,
  trainingModules,
  trainingProgress,
  userPermissions,
} from '@washington/db';
import { AppError } from '@washington/shared';
import type { JwtPayload } from '@washington/shared';
import { and, count, eq, isNull, or, sql } from 'drizzle-orm';

type ListModulesQuery = {
  page: number;
  limit: number;
  workspaceId?: string | undefined;
  active?: boolean | undefined;
};

export async function listModules(db: any, query: ListModulesQuery, user: JwtPayload) {
  const { page, limit, workspaceId, active } = query;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];

  if (user.role === 'franqueadora_admin') {
    if (workspaceId) {
      conditions.push(eq(trainingModules.workspaceId, workspaceId));
    }
    if (active !== undefined) {
      conditions.push(eq(trainingModules.active, active));
    }
  } else {
    conditions.push(eq(trainingModules.active, true));
    if (user.workspaceId) {
      conditions.push(
        or(eq(trainingModules.workspaceId, user.workspaceId), isNull(trainingModules.workspaceId)),
      );
    } else {
      conditions.push(isNull(trainingModules.workspaceId));
    }
    if (workspaceId) {
      conditions.push(eq(trainingModules.workspaceId, workspaceId));
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(trainingModules)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(trainingModules.order, trainingModules.createdAt),
    db.select({ value: count() }).from(trainingModules).where(where),
  ]);

  const filteredRows = await filterByRoleAndPermission(db, rows, user);

  const moduleIds = filteredRows.map((r: any) => r.id);

  const lessonCounts: Record<string, number> = {};
  const completedCounts: Record<string, number> = {};

  if (moduleIds.length > 0) {
    const lessonRows = await db
      .select({
        moduleId: trainingLessons.moduleId,
        lessonCount: count(),
      })
      .from(trainingLessons)
      .where(
        sql`${trainingLessons.moduleId} = ANY(ARRAY[${sql.join(
          moduleIds.map((id: string) => sql`${id}::uuid`),
          sql`, `,
        )}])`,
      )
      .groupBy(trainingLessons.moduleId);

    for (const row of lessonRows) {
      lessonCounts[row.moduleId] = Number(row.lessonCount);
    }

    const progressRows = await db
      .select({
        moduleId: trainingLessons.moduleId,
        completedCount: count(),
      })
      .from(trainingProgress)
      .innerJoin(trainingLessons, eq(trainingProgress.lessonId, trainingLessons.id))
      .where(
        and(
          eq(trainingProgress.userId, user.sub),
          sql`${trainingLessons.moduleId} = ANY(ARRAY[${sql.join(
            moduleIds.map((id: string) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      )
      .groupBy(trainingLessons.moduleId);

    for (const row of progressRows) {
      completedCounts[row.moduleId] = Number(row.completedCount);
    }
  }

  const data = filteredRows.map((r: any) => {
    const total = lessonCounts[r.id] ?? 0;
    const completed = completedCounts[r.id] ?? 0;
    return {
      ...r,
      lessonCount: total,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  return {
    data,
    total: data.length,
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

async function filterByRoleAndPermission(db: any, modules: any[], user: JwtPayload) {
  if (user.role === 'franqueadora_admin') return modules;

  const roleFiltered = modules.filter((m: any) => {
    if (!m.requiredRole) return true;
    return m.requiredRole === user.role;
  });

  const permissionRequired = roleFiltered.filter((m: any) => m.requiredPermission);
  const noPermissionRequired = roleFiltered.filter((m: any) => !m.requiredPermission);

  if (permissionRequired.length === 0) return noPermissionRequired;

  const neededPermissions = [
    ...new Set(permissionRequired.map((m: any) => m.requiredPermission as string)),
  ];

  const userPerms = await db
    .select({ permission: userPermissions.permission })
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, user.sub),
        sql`${userPermissions.permission} = ANY(ARRAY[${sql.join(
          neededPermissions.map((p: string) => sql`${p}`),
          sql`, `,
        )}])`,
      ),
    );

  const permSet = new Set(userPerms.map((p: any) => p.permission));

  const permFiltered = permissionRequired.filter((m: any) => permSet.has(m.requiredPermission));

  return [...noPermissionRequired, ...permFiltered];
}

export async function getModule(db: any, id: string, userId: string) {
  const [module] = await db.select().from(trainingModules).where(eq(trainingModules.id, id));

  if (!module) throw AppError.notFound('Module');

  const lessons = await db
    .select()
    .from(trainingLessons)
    .where(eq(trainingLessons.moduleId, id))
    .orderBy(trainingLessons.order, trainingLessons.createdAt);

  const lessonIds = lessons.map((l: any) => l.id);

  let completedSet = new Set<string>();
  if (lessonIds.length > 0) {
    const progress = await db
      .select({ lessonId: trainingProgress.lessonId })
      .from(trainingProgress)
      .where(
        and(
          eq(trainingProgress.userId, userId),
          sql`${trainingProgress.lessonId} = ANY(ARRAY[${sql.join(
            lessonIds.map((id: string) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      );
    completedSet = new Set(progress.map((p: any) => p.lessonId));
  }

  const lessonsWithProgress = lessons.map((l: any) => ({
    ...l,
    isCompleted: completedSet.has(l.id),
  }));

  return { ...module, lessons: lessonsWithProgress };
}

export async function createModule(db: any, data: any, authorId: string) {
  const [row] = await db
    .insert(trainingModules)
    .values({ ...data, authorId })
    .returning();
  return row;
}

export async function updateModule(db: any, id: string, data: any, userId: string, role: string) {
  const [existing] = await db.select().from(trainingModules).where(eq(trainingModules.id, id));

  if (!existing) throw AppError.notFound('Module');

  if (role !== 'franqueadora_admin' && existing.authorId !== userId) {
    throw AppError.forbidden();
  }

  const [row] = await db
    .update(trainingModules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(trainingModules.id, id))
    .returning();

  return row;
}

export async function deactivateModule(
  db: any,
  id: string,
  userId: string,
  role: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: trainingModules.id, authorId: trainingModules.authorId })
    .from(trainingModules)
    .where(eq(trainingModules.id, id));

  if (!existing) throw AppError.notFound('Module');

  if (role !== 'franqueadora_admin' && existing.authorId !== userId) {
    throw AppError.forbidden();
  }

  await db
    .update(trainingModules)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(trainingModules.id, id));
}

export async function addLesson(
  db: any,
  moduleId: string,
  data: any,
  userId: string,
  role: string,
) {
  const [module] = await db.select().from(trainingModules).where(eq(trainingModules.id, moduleId));

  if (!module) throw AppError.notFound('Module');

  if (role !== 'franqueadora_admin' && module.authorId !== userId) {
    throw AppError.forbidden();
  }

  const [row] = await db
    .insert(trainingLessons)
    .values({ ...data, moduleId })
    .returning();

  return row;
}

export async function updateLesson(
  db: any,
  lessonId: string,
  data: any,
  userId: string,
  role: string,
) {
  const [lesson] = await db
    .select({ id: trainingLessons.id, moduleId: trainingLessons.moduleId })
    .from(trainingLessons)
    .where(eq(trainingLessons.id, lessonId));

  if (!lesson) throw AppError.notFound('Lesson');

  const [module] = await db
    .select({ authorId: trainingModules.authorId })
    .from(trainingModules)
    .where(eq(trainingModules.id, lesson.moduleId));

  if (!module) throw AppError.notFound('Module');

  if (role !== 'franqueadora_admin' && module.authorId !== userId) {
    throw AppError.forbidden();
  }

  const [row] = await db
    .update(trainingLessons)
    .set(data)
    .where(eq(trainingLessons.id, lessonId))
    .returning();

  return row;
}

export async function deleteLesson(
  db: any,
  lessonId: string,
  userId: string,
  role: string,
): Promise<void> {
  const [lesson] = await db
    .select({ id: trainingLessons.id, moduleId: trainingLessons.moduleId })
    .from(trainingLessons)
    .where(eq(trainingLessons.id, lessonId));

  if (!lesson) throw AppError.notFound('Lesson');

  const [module] = await db
    .select({ authorId: trainingModules.authorId })
    .from(trainingModules)
    .where(eq(trainingModules.id, lesson.moduleId));

  if (!module) throw AppError.notFound('Module');

  if (role !== 'franqueadora_admin' && module.authorId !== userId) {
    throw AppError.forbidden();
  }

  await db.delete(trainingLessons).where(eq(trainingLessons.id, lessonId));
}

export async function completeLesson(db: any, lessonId: string, userId: string): Promise<void> {
  const [lesson] = await db
    .select({ id: trainingLessons.id })
    .from(trainingLessons)
    .where(eq(trainingLessons.id, lessonId));

  if (!lesson) throw AppError.notFound('Lesson');

  await db.insert(trainingProgress).values({ lessonId, userId }).onConflictDoNothing();
}
