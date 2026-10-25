import { getDb, DbClient } from './db';
import { logger } from './cloudwatch-logger';
import crypto from 'crypto';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_ORDER'
  | 'SEND_TO_KITCHEN'
  | 'CANCEL_ITEM'
  | 'UPDATE_ITEM_STATUS'
  | 'CLOSE_ORDER'
  | 'CREATE_MENU_ITEM'
  | 'UPDATE_MENU_ITEM'
  | 'DELETE_MENU_ITEM'
  | 'CREATE_TABLE'
  | 'UPDATE_TABLE'
  | 'CREATE_USER'
  | 'UPDATE_USER';

export type EntityType =
  | 'AUTH'
  | 'ORDER'
  | 'ORDER_ITEM'
  | 'KITCHEN_BATCH'
  | 'MENU_ITEM'
  | 'TABLE'
  | 'USER';

export interface AuditParams {
  actorId?: string | null;
  action: AuditAction;
  entityType: EntityType;
  entityId?: string | null;
  details?: Record<string, any> | string;
  ipAddress?: string | null;
}

/**
 * Ghi lại thao tác vào bảng audit_logs và đẩy đồng thời sang CloudWatch Logger
 */
export async function logAudit(params: AuditParams, customDb?: DbClient): Promise<void> {
  try {
    const db = customDb || (await getDb());
    const id = crypto.randomUUID();
    const detailsStr =
      typeof params.details === 'object'
        ? JSON.stringify(params.details)
        : params.details || null;

    await db.execute(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        id,
        params.actorId || null,
        params.action,
        params.entityType,
        params.entityId || null,
        detailsStr,
        params.ipAddress || null,
      ]
    );

    // Ghi CloudWatch log
    logger.info(`[AUDIT] ${params.action} on ${params.entityType}:${params.entityId || 'N/A'}`, {
      action: params.action,
      actorId: params.actorId,
      entityType: params.entityType,
      entityId: params.entityId || undefined,
      metadata: typeof params.details === 'object' ? params.details : { details: detailsStr },
    });
  } catch (error) {
    // Không làm sập luồng chính nếu audit log bị lỗi, nhưng ghi cảnh báo
    logger.error('Thất bại khi ghi audit log', error, {
      action: params.action,
      actorId: params.actorId,
    });
  }
}
