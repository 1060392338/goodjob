import type mysql from "mysql2/promise";

export interface MysqlUnitOfWork {
  run<T>(work: (connection: mysql.PoolConnection) => Promise<T>): Promise<T>;
}

export function createMysqlUnitOfWork(pool: Pick<mysql.Pool, "getConnection">): MysqlUnitOfWork {
  return {
    async run<T>(work: (connection: mysql.PoolConnection) => Promise<T>) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
      } catch (error) {
        try {
          await connection.rollback();
        } catch {
          // Preserve the original domain or persistence failure.
        }
        throw error;
      } finally {
        connection.release();
      }
    }
  };
}
