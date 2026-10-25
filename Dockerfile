# ==============================================================================
# Multi-Stage Production Dockerfile cho Hệ thống Quản lý Nhà hàng Thông minh
# Tối ưu hóa kích thước image, bảo mật user non-root và standalone Next.js
# ==============================================================================

# STAGE 1: Cài đặt dependencies
FROM node:24-alpine AS deps
WORKDIR /app

# Cài đặt libc6-compat cho Alpine
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

# STAGE 2: Build mã nguồn
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Sinh Prisma Client và Build Next.js Standalone
RUN npx prisma generate && npm run build

# STAGE 3: Runtime image nhỏ gọn, bảo mật
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Tạo user không có đặc quyền root để đảm bảo an toàn trên AWS EC2
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets và standalone bundle
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
