const fs = require('fs');
const path = require('path');

function cleanNftJson(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      cleanNftJson(fullPath);
    } else if (entry.name.endsWith('.nft.json')) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        if (raw.includes('.db_pglite')) {
          const json = JSON.parse(raw);
          if (Array.isArray(json.files)) {
            json.files = json.files.filter((f) => !f.includes('.db_pglite'));
            fs.writeFileSync(fullPath, JSON.stringify(json));
          }
        }
      } catch (err) {
        // bỏ qua lỗi đọc file phụ
      }
    }
  }
}

function cleanStandalone() {
  const standaloneDb = path.join(process.cwd(), '.next', 'standalone', '.db_pglite');
  if (fs.existsSync(standaloneDb)) {
    fs.rmSync(standaloneDb, { recursive: true, force: true });
    console.log('✅ Đã loại bỏ hoàn toàn .db_pglite khỏi .next/standalone');
  }
  cleanNftJson(path.join(process.cwd(), '.next'));
}

cleanStandalone();

