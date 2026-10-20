export interface ListQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
