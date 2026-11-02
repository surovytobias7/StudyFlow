// Read-only upgrade evidence: hashes/counts only; no conversation contents in output.
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const db = new DatabaseSync(process.argv[2], { readOnly: true });
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const manifest = { schema: db.prepare('PRAGMA user_version').get().user_version, tables: {} };
  for (const { name } of tables) {
    const rows = db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid').all();
    manifest.tables[name] = { count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  writeFileSync(process.argv[3], JSON.stringify(manifest, null, 2));
  console.info('Read-only profile manifest saved; schema', manifest.schema);
} finally { db.close(); }
