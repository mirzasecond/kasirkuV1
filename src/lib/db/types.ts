export interface Database {
  execute(sql: string, params?: any[]): number;
  all<T>(sql: string, params?: any[]): T[];
  get<T>(sql: string, params?: any[]): T | null;
  prepare(sql: string): Statement;
}

export interface Statement {
  bind(params?: any[]): void;
  run(): { changes: number; lastInsertRowid: number };
  get(params?: any[]): any;
  all(params?: any[]): any[];
  iterate(params?: any[]): IterableIterator<any>;
  columns(): string[];
}
