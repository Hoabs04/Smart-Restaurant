import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Giao diện kết nối cơ sở dữ liệu
export interface DbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ rowCount: number }>;
}

export interface TransactionClient extends DbClient {
  rollback(): Promise<void>;
}

// Biến lưu pool hoặc PGlite instance singleton
let pgliteInstance: PGlite | null = null;
let pgPoolInstance: pg.Pool | null = null;
let isInitialized = false;

/**
 * Khởi tạo và lấy đối tượng DB (Tự động kết nối RDS/Docker PostgreSQL nếu có, hoặc fallback PGlite persistent local)
 */
export async function getDb(): Promise<DbClient> {
  const databaseUrl = process.env.DATABASE_URL;
  const isPostgresServerSpecified = databaseUrl && !databaseUrl.includes('localhost:5432/smart_restaurant?fallback=pglite');

  // Thử kết nối pg pool nếu URL hợp lệ và không phải local fallback
  if (isPostgresServerSpecified && !pgPoolInstance && !pgliteInstance) {
    try {
      const pool = new pg.Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 3000,
      });
      // Kiểm tra kết nối
      const client = await pool.connect();
      client.release();
      pgPoolInstance = pool;
      console.log('✅ Đã kết nối cơ sở dữ liệu PostgreSQL (RDS/Server)');
    } catch (err) {
      console.warn('⚠️ Không kết nối được PostgreSQL server, tự động kích hoạt PGlite embedded PostgreSQL v16 engine!');
      pgPoolInstance = null;
    }
  }

  // Khởi tạo PGlite nếu không dùng pgPool
  if (!pgPoolInstance && !pgliteInstance) {
    const dataDir = path.join(process.cwd(), '.db_pglite');
    pgliteInstance = new PGlite(dataDir);
    console.log('🚀 Đã khởi tạo PGlite persistent engine tại:', dataDir);
  }

  // Chạy migration ban đầu nếu chưa khởi tạo
  if (!isInitialized) {
    await runMigrations();
    isInitialized = true;
  }

  const rawQuery = async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
    if (pgPoolInstance) {
      const res = await pgPoolInstance.query(sql, params);
      return res.rows as T[];
    } else {
      const res = await pgliteInstance!.query(sql, params);
      return res.rows as T[];
    }
  };

  const client: DbClient = {
    query: rawQuery,

    async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      const rows = await rawQuery<T>(sql, params);
      return rows.length > 0 ? rows[0] : null;
    },

    async execute(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
      if (pgPoolInstance) {
        const res = await pgPoolInstance.query(sql, params);
        return { rowCount: res.rowCount || 0 };
      } else {
        const res = await pgliteInstance!.query(sql, params);
        return { rowCount: res.affectedRows || res.rows.length || 0 };
      }
    },
  };

  return client;
}

/**
 * Thực thi một Transaction nguyên tử (Atomic Transaction)
 * Hỗ trợ tự động ROLLBACK khi có bất kỳ lỗi nào, hoặc COMMIT khi thành công
 */
export async function withTransaction<T>(
  callback: (tx: DbClient) => Promise<T>
): Promise<T> {
  const db = await getDb();

  if (pgPoolInstance) {
    const client = await pgPoolInstance.connect();
    try {
      await client.query('BEGIN');
      const txClient: DbClient = {
        async query<R = any>(sql: string, params: any[] = []): Promise<R[]> {
          const res = await client.query(sql, params);
          return res.rows as R[];
        },
        async queryOne<R = any>(sql: string, params: any[] = []): Promise<R | null> {
          const rows = await this.query<R>(sql, params);
          return rows.length > 0 ? rows[0] : null;
        },
        async execute(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
          const res = await client.query(sql, params);
          return { rowCount: res.rowCount || 0 };
        },
      };

      const result = await callback(txClient);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } else {
    // PGlite transaction
    return await pgliteInstance!.transaction(async (tx) => {
      const txClient: DbClient = {
        async query<R = any>(sql: string, params: any[] = []): Promise<R[]> {
          const res = await tx.query(sql, params);
          return res.rows as R[];
        },
        async queryOne<R = any>(sql: string, params: any[] = []): Promise<R | null> {
          const rows = await this.query<R>(sql, params);
          return rows.length > 0 ? rows[0] : null;
        },
        async execute(sql: string, params: any[] = []): Promise<{ rowCount: number }> {
          const res = await tx.query(sql, params);
          return { rowCount: res.affectedRows || res.rows.length || 0 };
        },
      };

      return await callback(txClient);
    });
  }
}

/**
 * Chạy migration file SQL ban đầu
 */
async function runMigrations(): Promise<void> {
  try {
    const migrationPath = path.join(process.cwd(), 'prisma', 'migrations', '0_init', 'migration.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      if (pgPoolInstance) {
        await pgPoolInstance.query(sql);
      } else if (pgliteInstance) {
        await pgliteInstance.exec(sql);
      }
      console.log('✅ Khởi tạo cấu trúc bảng cơ sở dữ liệu thành công.');
    }
  } catch (error) {
    console.error('Lỗi khi chạy migration:', error);
    throw error;
  }
}

/**
 * Đóng kết nối DB khi cần
 */
export async function closeDb(): Promise<void> {
  if (pgPoolInstance) {
    await pgPoolInstance.end();
    pgPoolInstance = null;
  }
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
  }
  isInitialized = false;
}
