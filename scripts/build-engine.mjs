// Builds (and optionally tests) the C++ engine. Works on Windows (MinGW g++), Linux and macOS.
//   node scripts/build-engine.mjs               build engine/build/admitqueue_engine(.exe)
//   node scripts/build-engine.mjs --if-missing  build only when the executable is missing or older than the sources
//   node scripts/build-engine.mjs --check       only verify that a C++17 compiler exists
//   node scripts/build-engine.mjs --tests       build and run all C++ unit tests
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = path.join(root, 'engine');
const buildDir = path.join(engineDir, 'build');
const exe = path.join(buildDir, process.platform === 'win32' ? 'admitqueue_engine.exe' : 'admitqueue_engine');
const args = new Set(process.argv.slice(2));

function findCompiler() {
  const candidates = [process.env.CXX, 'g++', 'clang++', 'c++'].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return { cmd: c, version: (r.stdout || '').split('\n')[0] };
  }
  return null;
}

const compiler = findCompiler();
if (!compiler) {
  console.error('ERROR: no C++ compiler found (tried g++, clang++, c++).');
  console.error('  Windows: install MSYS2 or WinLibs and add its "bin" folder to PATH, then open a NEW terminal.');
  console.error('  Linux:   sudo apt install g++      macOS: xcode-select --install');
  process.exit(1);
}
console.log(`Compiler: ${compiler.cmd} (${compiler.version})`);
if (args.has('--check')) process.exit(0);

const srcFiles = readdirSync(path.join(engineDir, 'src')).filter((f) => f.endsWith('.cpp')).sort();
const flags = ['-std=c++17', '-O2', '-Wall', '-Wextra', '-I', path.join(engineDir, 'include')];
const linkFlags = ['-static-libgcc', '-static-libstdc++'];
if (process.platform === 'win32') linkFlags.push('-static'); // no MinGW DLLs needed next to the .exe

function newestSource() {
  let newest = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/\.(cpp|h|hpp)$/.test(name)) newest = Math.max(newest, s.mtimeMs);
    }
  };
  walk(path.join(engineDir, 'src'));
  walk(path.join(engineDir, 'include'));
  return newest;
}

function compile(files, output) {
  mkdirSync(buildDir, { recursive: true });
  const r = spawnSync(compiler.cmd, [...flags, ...files, '-o', output, ...linkFlags], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`ERROR: compiling ${path.basename(output)} failed.`);
    process.exit(r.status || 1);
  }
}

if (args.has('--tests')) {
  const libs = srcFiles.filter((f) => f !== 'main.cpp').map((f) => path.join(engineDir, 'src', f));
  const tests = readdirSync(path.join(engineDir, 'tests')).filter((f) => /^test_.*\.cpp$/.test(f)).sort();
  let failed = 0;
  for (const t of tests) {
    const out = path.join(buildDir, t.replace(/\.cpp$/, process.platform === 'win32' ? '.exe' : ''));
    console.log(`\n=== ${t}`);
    compile([...libs, path.join(engineDir, 'tests', t)], out);
    const r = spawnSync(out, [], { encoding: 'utf8' });
    const lines = (r.stdout || '').split('\n').filter(Boolean);
    for (const l of lines.filter((x) => !x.startsWith('PASS'))) console.log(l);
    if (r.status !== 0) failed++;
  }
  console.log(failed === 0 ? '\nAll C++ test programs passed.' : `\n${failed} C++ test program(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

if (args.has('--if-missing') && existsSync(exe) && statSync(exe).mtimeMs >= newestSource()) {
  console.log(`Engine is up to date: ${exe}`);
  process.exit(0);
}

console.log('Building the engine ...');
compile(srcFiles.map((f) => path.join(engineDir, 'src', f)), exe);

// smoke test through the real stdin/stdout protocol
const smoke = spawnSync(exe, [], { input: '{"op":"health"}', encoding: 'utf8' });
let healthy = false;
try {
  healthy = JSON.parse(smoke.stdout).result.selfCheck === true;
} catch {
  healthy = false;
}
if (!healthy) {
  console.error('ERROR: the engine was built but its health check failed.');
  process.exit(1);
}
console.log(`OK: ${exe}`);
