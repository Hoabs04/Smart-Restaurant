// ==============================================================================
// CloudWatch-Compatible Structured Logger
// Chuẩn hóa định dạng log JSON tương thích AWS CloudWatch Logs Agent & Insights
// Tuân thủ nguyên tắc: KHÔNG ghi mật khẩu, token hoặc dữ liệu nhạy cảm
// ==============================================================================

export interface LogPayload {
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  action?: string;
  message: string;
  actorId?: string | null;
  actorRole?: string | null;
  requestId?: string;
  entityType?: string;
  entityId?: string;
  durationMs?: number;
  metadata?: Record<string, any>;
  error?: string;
}

export const logger = {
  info(message: string, data?: Partial<LogPayload>) {
    emitLog('INFO', message, data);
  },

  warn(message: string, data?: Partial<LogPayload>) {
    emitLog('WARN', message, data);
  },

  error(message: string, errorObj?: any, data?: Partial<LogPayload>) {
    const errorMsg = errorObj instanceof Error ? errorObj.stack || errorObj.message : String(errorObj || '');
    emitLog('ERROR', message, { ...data, error: errorMsg });
  },

  debug(message: string, data?: Partial<LogPayload>) {
    if (process.env.NODE_ENV !== 'production') {
      emitLog('DEBUG', message, data);
    }
  },
};

function sanitizeMetadata(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const sensitiveKeys = ['password', 'password_hash', 'token', 'jwt', 'secret', 'card', 'cvv'];
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeMetadata);
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeMetadata(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function emitLog(level: LogPayload['level'], message: string, data?: Partial<LogPayload>) {
  const timestamp = new Date().toISOString();
  const logRecord = {
    timestamp,
    service: 'smart-restaurant-backend',
    environment: process.env.NODE_ENV || 'development',
    level,
    message,
    ...data,
    metadata: data?.metadata ? sanitizeMetadata(data.metadata) : undefined,
  };

  const output = JSON.stringify(logRecord);
  if (level === 'ERROR') {
    console.error(output);
  } else if (level === 'WARN') {
    console.warn(output);
  } else {
    console.log(output);
  }
}
