import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    default: {
      ...actual,
      randomBytes: vi.fn(() => ({
        toString: () => 'mockedtoken1234567890abcdef12345678',
      })),
    },
  };
});

import bcrypt from 'bcryptjs';
import { forgotPassword, logout, resetPassword, validateLogin } from '../service.js';

const mockBcrypt = bcrypt as unknown as {
  compare: ReturnType<typeof vi.fn>;
  hash: ReturnType<typeof vi.fn>;
};

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    query: {
      users: { findFirst: vi.fn() },
      passwordResetTokens: { findFirst: vi.fn() },
      revokedTokens: { findFirst: vi.fn() },
    },
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    ...overrides,
  } as unknown as import('@washington/db').Db;
}

const activeUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'franqueado_admin' as const,
  workspaceId: 'ws-1',
  brandId: '1',
  active: true,
  passwordHash: '$2a$10$hashedpassword',
};

describe('validateLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns public user data on correct email and password', async () => {
    const db = makeDb();
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(true);

    const result = await validateLogin(db, 'test@example.com', 'correct-password');

    expect(result).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'franqueado_admin',
      workspaceId: 'ws-1',
      brandId: '1',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('throws UNAUTHORIZED when password does not match', async () => {
    const db = makeDb();
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(false);

    await expect(validateLogin(db, 'test@example.com', 'wrong-password')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
  });

  it('throws UNAUTHORIZED when user is inactive', async () => {
    const db = makeDb();
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...activeUser,
      active: false,
    });

    await expect(validateLogin(db, 'test@example.com', 'any-password')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
  });

  it('throws UNAUTHORIZED when email is not found (no info leak)', async () => {
    const db = makeDb();
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(validateLogin(db, 'unknown@example.com', 'any-password')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
  });

  it('returns same error message for wrong password and unknown email', async () => {
    const db1 = makeDb();
    (db1.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const db2 = makeDb();
    (db2.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(false);

    const err1 = await validateLogin(db1, 'unknown@example.com', 'pw').catch((e) => e);
    const err2 = await validateLogin(db2, 'test@example.com', 'wrong').catch((e) => e);

    expect(err1.message).toBe(err2.message);
  });
});

describe('forgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a reset token and returns it when user exists', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const db = makeDb();
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: insertValues });
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activeUser);

    const token = await forgotPassword(db, 'test@example.com');

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(insertValues).toHaveBeenCalledOnce();
    const insertArg = insertValues.mock.calls[0]?.[0];
    expect(insertArg).toMatchObject({ userId: 'user-1' });
  });

  it('returns a dummy token and does not throw for non-existent email', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const db = makeDb();
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: insertValues });
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const token = await forgotPassword(db, 'ghost@example.com');

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe('resetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates passwordHash and marks token as used for valid unused non-expired token', async () => {
    const resetToken = {
      id: 'rt-1',
      userId: 'user-1',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 3600_000),
      usedAt: null,
    };

    const setWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: setWhere });
    const db = makeDb();
    (db.query.passwordResetTokens.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      resetToken,
    );
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: setFn });
    mockBcrypt.hash.mockResolvedValue('$2a$10$newhash');

    await resetPassword(db, 'valid-token', 'newpassword123');

    expect(mockBcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('throws VALIDATION_ERROR for expired token', async () => {
    const db = makeDb();
    (db.query.passwordResetTokens.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(resetPassword(db, 'expired-token', 'newpassword123')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 422,
    });
  });

  it('throws VALIDATION_ERROR for already used token', async () => {
    const db = makeDb();
    (db.query.passwordResetTokens.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(resetPassword(db, 'used-token', 'newpassword123')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 422,
    });
  });
});

describe('logout', () => {
  it('inserts a record into revokedTokens', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const db = makeDb();
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: insertValues });

    const expiresAt = new Date(Date.now() + 3600_000);
    await logout(db, 'some-jwt-token', 'user-1', expiresAt);

    expect(insertValues).toHaveBeenCalledOnce();
    expect(insertValues.mock.calls[0]?.[0]).toMatchObject({
      token: 'some-jwt-token',
      userId: 'user-1',
      expiresAt,
    });
  });
});
