'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  QrCode, 
  Download, 
  Printer, 
  Copy, 
  Check, 
  ExternalLink,
  UtensilsCrossed,
  Sparkles
} from 'lucide-react';

interface TableQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableCode: string;
  areaName: string;
}

export default function TableQrModal({
  isOpen,
  onClose,
  tableCode,
  areaName,
}: TableQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [trackUrl, setTrackUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || !tableCode) return;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = `${origin}/track/table/${encodeURIComponent(tableCode)}`;
    setTrackUrl(fullUrl);
    setIsGenerating(true);

    QRCode.toDataURL(fullUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: {
        dark: '#020617', // slate-950
        light: '#ffffff',
      },
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Lỗi sinh mã QR bàn:', err);
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [isOpen, tableCode]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(trackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR_${tableCode.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mã QR Bàn - ${tableCode}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #fff;
              color: #0f172a;
              text-align: center;
            }
            .card {
              border: 3px solid #0f172a;
              border-radius: 24px;
              padding: 40px;
              max-width: 380px;
              box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            }
            .brand {
              font-size: 14px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #d97706;
              margin-bottom: 8px;
            }
            .table-title {
              font-size: 32px;
              font-weight: 900;
              margin: 0;
            }
            .area {
              font-size: 16px;
              color: #64748b;
              margin-top: 4px;
              margin-bottom: 24px;
            }
            .qr-img {
              width: 260px;
              height: 260px;
              border-radius: 16px;
              border: 1px solid #e2e8f0;
            }
            .instruction {
              font-size: 15px;
              font-weight: 700;
              color: #0f172a;
              margin-top: 20px;
            }
            .sub-instruction {
              font-size: 12px;
              color: #64748b;
              margin-top: 4px;
            }
            @media print {
              body { min-height: auto; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">Smart Restaurant</div>
            <h1 class="table-title">${tableCode}</h1>
            <div class="area">${areaName}</div>
            <img class="qr-img" src="${qrDataUrl}" alt="QR Code" />
            <div class="instruction">Quét mã bằng Camera điện thoại</div>
            <div class="sub-instruction">Theo dõi tiến độ chế biến món ăn trực tiếp từ Bếp</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 space-y-5 shadow-2xl relative">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-1.5">
                <span>Mã QR Bàn Ăn</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h3>
              <p className="text-xs text-slate-400">Dán tại bàn để khách quét theo dõi món</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Khung thẻ QR thiết kế in ấn */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 text-center space-y-4">
          <div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
              <UtensilsCrossed className="w-3 h-3" />
              <span>{areaName}</span>
            </span>
            <h4 className="text-2xl font-black text-slate-100 mt-1">{tableCode}</h4>
          </div>

          {/* Vùng QR Code */}
          <div className="bg-white p-3 rounded-2xl border-4 border-amber-500/40 inline-block shadow-xl">
            {isGenerating ? (
              <div className="w-52 h-52 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Mã QR ${tableCode}`}
                className="w-52 h-52 object-contain"
              />
            ) : (
              <div className="w-52 h-52 flex items-center justify-center text-rose-500 text-xs">
                Lỗi tạo mã QR
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Khách dùng camera điện thoại quét mã để xem trực tiếp tiến độ từ khi phục vụ order đến khi bếp nấu xong.
          </p>
        </div>

        {/* Đường dẫn & Copy link */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400">Đường dẫn trực tiếp:</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={trackUrl}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
            </button>
          </div>
        </div>

        {/* Các nút hành động: In / Tải ảnh */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={handleDownload}
            disabled={!qrDataUrl || isGenerating}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Tải ảnh PNG</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={!qrDataUrl || isGenerating}
            className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>In thẻ bàn</span>
          </button>
        </div>

      </div>
    </div>
  );
}
