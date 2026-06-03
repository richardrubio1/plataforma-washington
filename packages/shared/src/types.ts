export type Role = 'franqueadora_admin' | 'franqueado_admin' | 'franqueado_professor' | 'aluno';

export type Brand = 1 | 2; // 1 = Washington Web, 2 = 123 Inglês

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: Role;
  workspaceId: string | null; // null for franqueadora_admin
  brandId?: Brand;
  iat: number;
  exp: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
