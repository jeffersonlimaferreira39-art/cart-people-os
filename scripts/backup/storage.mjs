// Copia os arquivos do Storage (buckets privados) para uma pasta e de volta.
//   node scripts/backup/storage.mjs backup  <pasta>
//   node scripts/backup/storage.mjs restore <pasta>
// Requer SUPABASE_URL e SUPABASE_SECRET_KEY (chave secreta: só em máquina/CI confiável).
import { createClient } from "@supabase/supabase-js";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const BUCKETS = ["employee-documents", "org-documents"];
const [mode, dir] = process.argv.slice(2);
if (!["backup", "restore"].includes(mode) || !dir) {
  console.error("uso: node scripts/backup/storage.mjs backup|restore <pasta>");
  process.exit(2);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("defina SUPABASE_URL e SUPABASE_SECRET_KEY");
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function listAll(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listAll(bucket, path))); // pasta
      else out.push(path);
    }
    if (data.length < 1000) return out;
  }
}

async function walk(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const p = join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

let total = 0;
for (const bucket of BUCKETS) {
  const base = join(dir, bucket);
  if (mode === "backup") {
    const files = await listAll(bucket);
    for (const path of files) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw new Error(`${bucket}/${path}: ${error.message}`);
      const target = join(base, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await data.arrayBuffer()));
    }
    total += files.length;
    console.log(`  ${bucket}: ${files.length} arquivo(s)`);
  } else {
    const files = await walk(base);
    for (const file of files) {
      const path = relative(base, file).split("\\").join("/");
      const body = await readFile(file);
      const { error } = await supabase.storage.from(bucket).upload(path, body, { upsert: true });
      if (error) throw new Error(`${bucket}/${path}: ${error.message}`);
    }
    total += files.length;
    console.log(`  ${bucket}: ${files.length} arquivo(s) restaurado(s)`);
  }
}
await mkdir(dir, { recursive: true });
if (mode === "backup") await writeFile(join(dir, "count.txt"), `${total}\n`);
console.log(`✓ Storage: ${total} arquivo(s)`);
