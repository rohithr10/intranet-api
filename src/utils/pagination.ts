import type { Paginated } from '../types/domain.js';

export interface PageQuery {
  page: number;
  limit: number;
}

export function skipFor({ page, limit }: PageQuery): number {
  return (page - 1) * limit;
}

export function paginate<T>(items: T[], total: number, { page, limit }: PageQuery): Paginated<T> {
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
