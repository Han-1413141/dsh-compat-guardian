import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { rescueProfile } from '../lib/core.js';
const RUNTIME_VERSION = '0.2.0-rc.2';

const root = await mkdtemp(join(tmpdir(), 'dsh-startup-faults-'));
const cli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'));
const anchor = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const profile = join(root, 'home', 'profiles', 'web');
const env = { ...process.env, DSH_HOME: join(root, 'home'), DSH_PRIMARY_RUNTIME: '', DSH_TELEMETRY_DISABLED: '1', DSH_TOOLKIT_ALLOW_FATAL_FIXTURE: '1' };
delete env.DEEPSEEK_API_KEY;
async function stop(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
  else child.kill('SIGKILL');
  await new Promise(done => { if (child.exitCode !== null) done(); else child.once('exit', done); });
}
async function boot() {
  const child = spawn(process.execPath, [cli, '--profile', 'web', '--no-open', '--port', '0'], { env, cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '', timer;
  try {
    return await new Promise((done, reject) => {
      const result = (ready, timedOut = false) => ({ ready, timedOut, exitCode: child.exitCode, log: log.replace(/\?token=[^\s]+/g, '?token=<redacted>') });
      timer = setTimeout(() => done(result(false, true)), 12000);
      child.once('error', reject); child.once('exit', () => done(result(false)));
      for (const stream of [child.stdout, child.stderr]) stream.on('data', x => {
        log = (log + x).slice(-40000);
        if (/dsh web: http/.test(log)) done(result(true));
      });
    });
  } finally { clearTimeout(timer); await stop(child); }
}
const results = [];
try {
  const cases = ['missing-export', 'invalid-config', 'process-exit', 'hanging-apply'];
  await promisify(execFile)(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', ...cases.map(x => resolve('tests/fixtures/plugins', x)), '--ignore-scripts'], { cwd: root, env, windowsHide: true, timeout: 90000 });
  const packageFile = join(profile, 'package.json');
  const manifest = JSON.parse(await readFile(packageFile, 'utf8'));
  const foundation = manifest.dsh.profile.bundles.filter(x => !x.startsWith('dsh-fixture-'));
  for (const name of cases) {
    const packageName = `dsh-fixture-${name}`;
    manifest.dsh.profile.bundles = [...foundation, packageName];
    await writeFile(packageFile, JSON.stringify(manifest, null, 2));
    const before = await boot();
    if (name === 'process-exit') assert.equal(before.exitCode, 73);
    else if (name === 'hanging-apply') assert(before.timedOut, JSON.stringify(before));
    else assert(before.log.includes(name) && /export|number|config/i.test(before.log), `fault not reproduced: ${name}`);
    const rescued = await rescueProfile(profile, RUNTIME_VERSION, { apply: true, installAnchor: anchor, targets: [packageName] });
    assert(rescued.applied);
    const backup = JSON.parse(await readFile(rescued.recordPath, 'utf8'));
    assert(backup.before.includes(packageName));
    const after = await boot(); assert(after.ready, `rescue did not recover: ${name}\n${after.log}`);
    results.push({ name, before, rescued: true, after: { ready: after.ready, exitCode: after.exitCode }, backupSaved: true });
    console.log(`${name}: ${before.timedOut ? '实际启动超时' : before.ready ? '实际加载失败，宿主降级启动' : `实际退出 ${before.exitCode}`} → 离线停用 → 恢复正常启动。`);
  }
  await mkdir('.test-output', { recursive: true });
  await writeFile('.test-output/startup-fault-report.json', JSON.stringify({ ok: true, runtime: RUNTIME_VERSION, results }, null, 2));
} finally {
  if (process.env.KEEP_CONFLICT_FIXTURES === '1') console.log(`保留测试目录：${root}`);
  else await rm(root, { recursive: true, force: true });
}
