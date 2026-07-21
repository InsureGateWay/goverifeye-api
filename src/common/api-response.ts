export interface PageMeta { page: number; pageSize: number; total: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean; sortBy?: string; sortDirection?: string }
export interface Page<T> { data: T[]; meta: PageMeta }
export const pageOf = <T>(data: T[], total: number, page: number, pageSize: number, sortBy?: string, sortDirection?: string): Page<T> => ({
  data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), hasNextPage: page * pageSize < total, hasPreviousPage: page > 1, sortBy, sortDirection },
});
