const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function indexWorkspace(input, includeGenerated = false) {
  const root = path.resolve(input);
  const realRoot = fs.realpathSync(root);
  if (!fs.statSync(realRoot).isDirectory()) throw new Error('Workspace is not a directory');
  const skipped = new Set(['node_modules', 'dist', 'build', 'target', '.next', '.cache', '__pycache__', '.venv', 'vendor']);
  const stack = [''];
  const files = [];
  let unreadable = 0;
  let bytes = 0;
  let directories = 0;
  let truncated = false;
  const started = Date.now();
  scan: while (stack.length) {
    if (++directories > 10000 || Date.now() - started > 12000) { truncated = true; break; }
    const relative = stack.pop();
    let directory;
    try { directory = fs.opendirSync(path.join(realRoot, relative)); }
    catch (error) { if (!relative) throw error; unreadable++; continue; }
    try {
      let entry;
      while ((entry = directory.readSync())) {
        if (Date.now() - started > 12000) { truncated = true; break scan; }
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        // Never follow links/junctions outside the selected workspace or into cycles.
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (entry.name !== '.git' && (includeGenerated || !skipped.has(entry.name))) stack.push(name);
        } else if (entry.isFile()) {
          bytes += Buffer.byteLength(JSON.stringify(name)) + 1;
          if (files.length >= 20000 || bytes > 700000 || Date.now() - started > 12000) { truncated = true; break scan; }
          files.push(name);
        }
      }
    } finally { directory.closeSync(); }
  }
  files.sort();
  return { root, files, unreadable, truncated };
}

function encodeIndex(index) {
  let encoded;
  do {
    encoded = zlib.gzipSync(JSON.stringify(index)).toString('base64');
    if (encoded.length <= 60000) return `gzip:${encoded}`;
    index.truncated = true;
    index.files.length = Math.floor(index.files.length * 0.75);
  } while (index.files.length);
  throw new Error('Workspace index exceeds the host output limit');
}

module.exports = { indexWorkspace, encodeIndex };
if (!module.parent) {
  try { process.stdout.write(encodeIndex(indexWorkspace(process.argv[1], process.argv[2] === 'all'))); }
  catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
}
