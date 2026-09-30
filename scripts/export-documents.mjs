// Export all active Proof documents as clean .md files.
// Usage: npx tsx scripts/export-documents.mjs <targetDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { stripAllProofSpanTags } from '../server/proof-span-strip.js';

const targetDir = process.argv[2];
if (!targetDir) {
  console.error('Usage: tsx scripts/export-documents.mjs <targetDir>');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Database = require(path.join(repoRoot, 'node_modules', 'better-sqlite3'));

const dbPath = process.env.DATABASE_PATH || path.join(repoRoot, 'proof-share.db');
const db = new Database(dbPath, { readonly: true });
db.pragma('busy_timeout = 5000');

function cleanMarkdown(markdown) {
  const withoutSpans = stripAllProofSpanTags(markdown);
  return (withoutSpans
    .replace(/\n?<!-- PROVENANCE\n[\s\S]*?\n-->\s*$/g, '')
    .replace(/<!-- PROOF:(START|END) -->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n');
}

function safeFileName(title, slug) {
  const base = (title || slug || 'untitled')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || slug}.md`;
}

const rows = db.prepare(`
  SELECT d.slug,
         COALESCE(NULLIF(d.title, ''), d.slug) AS title,
         COALESCE(NULLIF(p.markdown, ''), d.markdown, '') AS markdown
  FROM documents d
  LEFT JOIN document_projections p ON p.document_slug = d.slug
  WHERE d.share_state = 'ACTIVE'
  ORDER BY d.updated_at DESC
`).all();

mkdirSync(targetDir, { recursive: true });

const used = new Set();
const written = [];
for (const row of rows) {
  let name = safeFileName(row.title, row.slug);
  if (used.has(name)) {
    name = `${safeFileName(row.title, row.slug).replace(/\.md$/, '')}-${row.slug}.md`;
  }
  used.add(name);
  const filePath = path.join(targetDir, name);
  writeFileSync(filePath, cleanMarkdown(row.markdown), 'utf8');
  written.push({ slug: row.slug, title: row.title, file: filePath });
}
db.close();
console.log(JSON.stringify({ count: written.length, files: written }, null, 2));
