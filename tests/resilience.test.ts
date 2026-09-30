import test from 'node:test';

import assert from 'node:assert/strict';

import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';

import { join } from 'node:path';

import { tmpdir } from 'node:os';

import { scanProfile } from '../shared/profile.ts';

import { checkCompatibility } from '../shared/compatibility.ts';

import { writeJson, withLock } from '../shared/files.ts';

const RUNTIME_VERSION = '0.2.0-rc.2';

import { rescueProfile, restoreRescue } from '../src/rescue.ts';

import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader';

import { TYPERT } from '../src/typert.ts';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-resilience-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJson(join(root, 'package.json'), { dependencies: { 'fixture-addon': '1.0.0' }, dsh: { profile: { bundles: ['fixture-addon'] } } });
  const directory = join(root, 'node_modules', 'fixture-addon'); await mkdir(directory, { recursive: true });
  const manifest = { name: 'fixture-addon', version: '1.0.0', main: 'index.js', dsh: { bundle: { patch: './cordis.patch.yml' } }, dshCompat: { dsh: '>=0.2.0-rc.2 <0.3.0-0' } };
  await writeJson(join(directory, 'package.json'), manifest);
  await writeFile(join(directory, 'cordis.patch.yml'), '- insert:\n  - id: addon\n    name: fixture-addon\n');
  await writeFile(join(directory, 'index.js'), 'throw new Error("scanner executed code")');
  return { root, directory, manifest };
}

for (const scenario of ['missing-manifest', 'malformed-manifest', 'missing-patch', 'malformed-patch', 'escaping-patch', 'missing-client', 'wrong-package-name'] as const) {
  test(`损坏安装可定位且离线救援保留原文：${scenario}`, async t => {
    const { root, directory, manifest } = await fixture(t);
    if (scenario === 'missing-manifest') await rm(join(directory, 'package.json'));
    if (scenario === 'malformed-manifest') await writeFile(join(directory, 'package.json'), '{broken');
    if (scenario === 'missing-patch') await rm(join(directory, 'cordis.patch.yml'));
    if (scenario === 'malformed-patch') await writeFile(join(directory, 'cordis.patch.yml'), '[unterminated');
    if (scenario === 'escaping-patch') await writeJson(join(directory, 'package.json'), { ...manifest, dsh: { bundle: { patch: '../../outside.yml' } } });
    if (scenario === 'missing-client') await writeJson(join(directory, 'package.json'), { ...manifest, dsh: { ...manifest.dsh, client: { platform: 'web' } }, exports: { './client': './lib/client.js' } });
    if (scenario === 'wrong-package-name') await writeJson(join(directory, 'package.json'), { ...manifest, name: 'wrong-addon' });
    const before = await readFile(join(root, 'package.json'), 'utf8');
    const rows = await scanProfile(root); assert(rows[0].loadError);
    assert.deepEqual(checkCompatibility(rows, RUNTIME_VERSION).quarantine, ['fixture-addon']);
    const rescue = await rescueProfile(root, RUNTIME_VERSION, { apply: true });
    assert.equal(rescue.applied, true);
    assert.equal(JSON.parse(await readFile(rescue.recordPath!, 'utf8')).before, before);
    await assert.rejects(restoreRescue(root, rescue.recoveryId!, RUNTIME_VERSION), /不可恢复|冲突/);
  });
}

test('本地 link 源目录移动后识别失效链接并允许离线停用', async t => {
  const { root, directory } = await fixture(t), source = join(root, 'source'), moved = join(root, 'moved');
  await rename(directory, source);
  await symlink(source, directory, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await scanProfile(root))[0].loadError, undefined);
  await rename(source, moved);
  assert((await scanProfile(root))[0].loadError);
  assert.equal((await rescueProfile(root, RUNTIME_VERSION, { apply: true })).applied, true);
});

test('合法的 ID 定向覆盖和完整前端产物不被误判为重复注册', async t => {
  const { root, directory, manifest } = await fixture(t);
  await writeFile(join(directory, 'cordis.patch.yml'), '- insert:\n  - id: addon\n    name: fixture-addon\n- id: addon\n  config:\n    enabled: true\n');
  await writeFile(join(directory, 'client.js'), 'throw new Error("must never be executed by scanner")');
  await writeJson(join(directory, 'package.json'), { ...manifest, dsh: { ...manifest.dsh, client: { platform: 'web' } }, exports: { './client': { default: './client.js' } } });
  const rows = await scanProfile(root);
  assert.equal(rows[0].loadError, undefined); assert.deepEqual(checkCompatibility(rows, RUNTIME_VERSION).findings, []);
});

test('官方锁正在占用时救援不能改写 profile，锁释放后可继续', async t => {
  const { root } = await fixture(t), before = await readFile(join(root, 'package.json'), 'utf8');
  await withLock(join(root, 'package.json.lock'), async () => {
    await assert.rejects(rescueProfile(root, RUNTIME_VERSION, { apply: true, targets: ['fixture-addon'] }));
    assert.equal(await readFile(join(root, 'package.json'), 'utf8'), before);
  });
  assert.equal((await rescueProfile(root, RUNTIME_VERSION, { apply: true, targets: ['fixture-addon'] })).applied, true);
});

test('救援写入后中断可恢复一次，伪造记录和重复恢复被拒绝', async t => {
  const { root } = await fixture(t);
  const rescue = await rescueProfile(root, RUNTIME_VERSION, { apply: true, targets: ['fixture-addon'] });
  const saved = JSON.parse(await readFile(rescue.recordPath!, 'utf8'));
  await writeJson(rescue.recordPath!, { ...saved, status: 'prepared' });
  assert.deepEqual((await restoreRescue(root, rescue.recoveryId!, RUNTIME_VERSION)).restored, ['fixture-addon']);
  await assert.rejects(restoreRescue(root, rescue.recoveryId!, RUNTIME_VERSION), /已经恢复/);
  await writeJson(rescue.recordPath!, { ...saved, before: 'tampered' });
  await assert.rejects(restoreRescue(root, rescue.recoveryId!, RUNTIME_VERSION), /记录无效/);
});

test('RPC 旧编解码声明缺少 create 时被真实 DSH 验证器拒绝', () => {
  const bad = { ...TYPERT, invocations: TYPERT.invocations.map(x => ({ ...x, result: { ...x.result, create: undefined } })) };
  assert.throws(() => validateTypertManifest('dsh-compat-guardian', bad), /create/);
});
