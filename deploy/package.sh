#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"
release="$(date -u +%Y%m%dT%H%M%SZ)"
output_dir="$project_dir/deployment-artifacts/$release"
mkdir -p "$output_dir"
npm test
# Build into a new directory: preserve every previous dist and release.
npm run build -- --outDir "$output_dir/dist"
node --input-type=module - "$output_dir/dist" <<'JS'
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.argv[2];
const localEnv = await readFile('.env.local', 'utf8').catch(() => '');
const key = localEnv.match(/^VITE_NASA_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (/\.(js|html|css|map)$/.test(path)) {
      const text = await readFile(path, 'utf8');
      if ((key && text.includes(key)) || text.includes('api.nasa.gov/neo/rest/v1/feed')) throw new Error('Production bundle contains direct NASA credentials/request code');
    }
  }
}
await scan(root);
console.log('Production bundle credential check passed');
JS
cp -R deploy "$output_dir/deploy"
cp -R server "$output_dir/server"
mkdir -p "$output_dir/src"
cp src/data.js src/cache.js "$output_dir/src/"
cp package.json "$output_dir/package.json"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$output_dir/neo-watch-$release.tar.gz" -C "$output_dir" dist deploy server src package.json
printf '\nDeployment archive: %s\nRelease: %s\n' "$output_dir/neo-watch-$release.tar.gz" "$release"
