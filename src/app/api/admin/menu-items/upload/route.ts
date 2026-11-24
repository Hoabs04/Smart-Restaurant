import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

function signAwsV4Put(params: {
  bucket: string;
  region: string;
  key: string;
  contentType: string;
  payload: Buffer;
  accessKeyId: string;
  secretAccessKey: string;
}): { url: string; headers: Record<string, string> } {
  const { bucket, region, key, contentType, payload, accessKeyId, secretAccessKey } = params;
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n/${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto
    .createHash('sha256')
    .update(canonicalRequest)
    .digest('hex')}`;

  const hmac = (k: Buffer | string, d: string) => crypto.createHmac('sha256', k).update(d).digest();
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    url: `https://${host}/${key}`,
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ['manager']);
  if ('errorResponse' in auth) return auth.errorResponse;

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, code: 'FILE_REQUIRED', message: 'Vui lòng chọn tệp ảnh hợp lệ.' },
        { status: 400 }
      );
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { success: false, code: 'UNSUPPORTED_TYPE', message: 'Chỉ hỗ trợ ảnh JPG, PNG, WebP hoặc SVG.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, code: 'FILE_TOO_LARGE', message: 'Kích thước ảnh tối đa là 3 MB.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = `dish-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const s3Key = `dishes/${safeName}`;

    // Lưu bản local vào public/images/dishes để hiển thị trực tiếp
    const localDir = path.join(process.cwd(), 'public', 'images', 'dishes');
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(path.join(localDir, safeName), buffer);

    let storageMode: 's3' | 'local' = 'local';
    const awsKey = process.env.AWS_ACCESS_KEY_ID?.trim();
    const awsSecret = process.env.AWS_SECRET_ACCESS_KEY?.trim();
    const bucket = process.env.S3_BUCKET_NAME?.trim();
    const region = process.env.AWS_REGION?.trim() || 'ap-southeast-1';

    if (awsKey && awsSecret && bucket) {
      try {
        const signed = signAwsV4Put({
          bucket,
          region,
          key: s3Key,
          contentType: file.type,
          payload: buffer,
          accessKeyId: awsKey,
          secretAccessKey: awsSecret,
        });
        const s3Res = await fetch(signed.url, {
          method: 'PUT',
          headers: signed.headers,
          body: buffer,
          signal: AbortSignal.timeout(10000),
        });
        if (s3Res.ok) {
          storageMode = 's3';
        }
      } catch (s3Err) {
        console.warn('Upload S3 không thành công, giữ bản lưu local:', s3Err);
      }
    }

    const imagePath = `/images/dishes/${safeName}`;

    await logAudit({
      actorId: auth.user.userId,
      action: 'UPDATE_MENU_ITEM',
      entityType: 'MENU_ITEM',
      details: { action: 'UPLOAD_DISH_IMAGE', imagePath, storageMode },
      ipAddress: getClientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      message:
        storageMode === 's3'
          ? 'Đã tải ảnh lên Amazon S3 và đồng bộ thành công.'
          : 'Đã tải ảnh lên máy chủ cục bộ thành công.',
      imageKey: imagePath,
      storageMode,
    });
  } catch (error) {
    console.error('Lỗi POST /api/admin/menu-items/upload:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Lỗi máy chủ khi tải ảnh lên.' },
      { status: 500 }
    );
  }
}
