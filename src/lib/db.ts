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
 * Khởi tạo và lấy đối tượng DB
 * - Production: Bắt buộc kết nối PostgreSQL server (RDS/Docker). Tuyệt đối KHÔNG fallback sang PGlite (Fail-fast).
 * - Dev/Test: Chỉ fallback sang PGlite embedded nếu có cờ DB_FALLBACK_PGLITE=true hoặc không chỉ định server PostgreSQL.
 * - Migration: Không tự động chạy migration trên PostgreSQL pool mỗi cold-start (tránh DDL lock/conflict). Dùng prisma migrate deploy lúc deploy.
 */
export async function getDb(): Promise<DbClient> {
  const isProduction = process.env.NODE_ENV === 'production';
  const databaseUrl = process.env.DATABASE_URL;
  const isPostgresServerSpecified = databaseUrl && !databaseUrl.includes('localhost:5432/smart_restaurant?fallback=pglite');
  const allowPgliteFallback = process.env.DB_FALLBACK_PGLITE === 'true';

  if (isProduction) {
    if (!databaseUrl || !isPostgresServerSpecified) {
      throw new Error(
        'CRITICAL DATABASE ERROR: DATABASE_URL pointing to a valid PostgreSQL server must be configured in production environment.'
      );
    }

    if (!pgPoolInstance) {
      try {
        const pool = new pg.Pool({
          connectionString: databaseUrl,
          connectionTimeoutMillis: 5000,
        });
        const client = await pool.connect();
        client.release();
        pgPoolInstance = pool;
        console.log('✅ Đã kết nối cơ sở dữ liệu PostgreSQL (RDS/Server Production)');
      } catch (err: any) {
        console.error('❌ [DATABASE CRITICAL] Không thể kết nối tới PostgreSQL trong môi trường Production:', err);
        pgPoolInstance = null;
        throw new Error(
          `CRITICAL DATABASE ERROR: Failed to connect to PostgreSQL server in production: ${err?.message || err}. Application halted to prevent data split-brain.`
        );
      }
    }
  } else {
    // Non-production (development / test)
    if (isPostgresServerSpecified && !pgPoolInstance && !pgliteInstance) {
      try {
        const pool = new pg.Pool({
          connectionString: databaseUrl,
          connectionTimeoutMillis: 3000,
        });
        const client = await pool.connect();
        client.release();
        pgPoolInstance = pool;
        console.log('✅ Đã kết nối cơ sở dữ liệu PostgreSQL (RDS/Server)');
      } catch (err: any) {
        if (allowPgliteFallback) {
          console.warn('⚠️ [DEV/TEST] Không kết nối được PostgreSQL server, kích hoạt PGlite embedded do cờ DB_FALLBACK_PGLITE=true được bật.');
          pgPoolInstance = null;
        } else {
          console.error('❌ [DATABASE ERROR] Không kết nối được PostgreSQL server:', err?.message || err);
          pgPoolInstance = null;
          throw new Error(
            `DATABASE CONNECTION FAILED: Không thể kết nối tới PostgreSQL server tại ${databaseUrl}. Nếu muốn tự động fallback sang PGlite trong dev/test, hãy đặt DB_FALLBACK_PGLITE=true trong file .env.`
          );
        }
      }
    }

    // Khởi tạo PGlite nếu không dùng pgPool (chỉ cho phép trong non-production)
    if (!pgPoolInstance && !pgliteInstance) {
      const getPgliteDataDir = () => {
        if (process.env.PGLITE_DATA_DIR) return process.env.PGLITE_DATA_DIR;
        const cwd = process.cwd();
        const isTestEnv = process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event === 'test';
        const pgliteFolderName = isTestEnv
          ? ['.db', 'pglite', 'test'].join('_')
          : ['.db', 'pglite'].join('_');
        return [cwd, pgliteFolderName].join(path.sep);
      };
      const dataDir = getPgliteDataDir();
      pgliteInstance = new PGlite(dataDir);
      console.log('🚀 Đã khởi tạo PGlite persistent engine tại:', dataDir);
    }
  }

  // Khởi tạo schema nếu cần:
  // - PostgreSQL pool: Không chạy migration tự động lúc cold-start (trừ khi có cờ AUTO_MIGRATE=true).
  // - PGlite embedded: Khởi tạo bảng ban đầu nếu chưa có.
  if (!isInitialized) {
    if (pgliteInstance) {
      await ensurePgliteInitialized();
      isInitialized = true;
    } else if (pgPoolInstance) {
      if (process.env.AUTO_MIGRATE === 'true') {
        await runMigrations();
      }
      isInitialized = true;
    }
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
 * Đảm bảo PGlite đã được khởi tạo cấu trúc bảng ban đầu
 */
async function ensurePgliteInitialized(): Promise<void> {
  if (!pgliteInstance) return;
  try {
    const tableCheck = await pgliteInstance.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'orders';`
    );
    if (!tableCheck.rows || tableCheck.rows.length === 0) {
      await runMigrations();
      try {
        const { runInitialSeed } = await import('./seed-data');
        const dbClient: DbClient = {
          query: async <T = any>(sql: string, params?: any[]) => {
            const res = await pgliteInstance!.query(sql, params);
            return res.rows as T[];
          },
          queryOne: async <T = any>(sql: string, params?: any[]) => {
            const res = await pgliteInstance!.query(sql, params);
            return (res.rows[0] as T) || null;
          },
          execute: async (sql: string, params?: any[]) => {
            const res = await pgliteInstance!.query(sql, params);
            return { rowCount: res.affectedRows || res.rows.length || 0 };
          },
        };
        await runInitialSeed(dbClient);
      } catch (seedErr) {
        console.warn('Lỗi khi nạp dữ liệu mẫu tự động:', seedErr);
      }
    } else {
      // Kiểm tra bảng sales_channels đã tồn tại chưa
      const channelCheck = await pgliteInstance.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_channels';`
      );
      if (!channelCheck.rows || channelCheck.rows.length === 0) {
        await runSalesChannelsMigration();
      }

      // Bỏ ràng buộc NOT NULL trên table_id để hỗ trợ đơn giao hàng trực tuyến
      try {
        await pgliteInstance.exec(
          `ALTER TABLE orders ALTER COLUMN table_id DROP NOT NULL;`
        );
      } catch {}

      // Loại bỏ ràng buộc thừa uq_ledger_idemp_menu_movement nếu database PGlite cũ còn tồn tại
      try {
        await pgliteInstance.exec(
          `ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS uq_ledger_idemp_menu_movement;`
        );
      } catch {}

      // Đảm bảo inventory_ledger có cột created_at
      try {
        await pgliteInstance.exec(
          `ALTER TABLE inventory_ledger ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;`
        );
      } catch {}
    }
  } catch {
    await runMigrations();
  }
}

/**
 * Chạy migration cho module sales_channels
 */
async function runSalesChannelsMigration(): Promise<void> {
  try {
    const migrationPath = path.join(process.cwd(), 'prisma', 'migrations', '1_sales_channels', 'migration.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      if (pgPoolInstance) {
        await pgPoolInstance.query(sql);
      } else if (pgliteInstance) {
        await pgliteInstance.exec(sql);
      }
      console.log('✅ Khởi tạo cấu trúc bảng sales_channels thành công.');
    }
  } catch (error) {
    console.error('Lỗi khi chạy migration sales_channels:', error);
  }
}

/**
 * Chạy migration files SQL ban đầu
 */
async function runMigrations(): Promise<void> {
  try {
    const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const dirs = fs.readdirSync(migrationsDir).sort();
      for (const dir of dirs) {
        const migrationPath = path.join(migrationsDir, dir, 'migration.sql');
        if (fs.existsSync(migrationPath)) {
          const sql = fs.readFileSync(migrationPath, 'utf-8');
          if (pgPoolInstance) {
            await pgPoolInstance.query(sql);
          } else if (pgliteInstance) {
            await pgliteInstance.exec(sql);
          }
          console.log(`✅ Khởi tạo migration [${dir}] thành công.`);
        }
      }
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
