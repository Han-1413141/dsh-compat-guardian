import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { checkCompatibility } from '../shared/compatibility.ts';
import { atomicWrite, digest, optionalText, readJson, withLock, writeJson } from '../shared/files.ts';
import { scanProfile } from '../shared/profile.ts';
import type { PackageManifest } from '../shared/types.ts';

interface RescueRecord {
  schemaVersion: 1; id: string; directory: string; createdAt: string; runtimeVersion: string;
  removed: { name: string; version: string; index: number }[];
  before: string; beforeHash: string; afterHash: string; status: 'prepared' | 'applied' | 'restored';
  otherFiles: Record<string, string>;
}
/** Offline rescue only deselects bundles. No third-party plugin code is imported. */
export async function rescueProfile(directory: string, runtimeVersion: string, options: { apply?: boolean; installAnchor?: string; targets?: string[] } = {}) {
  directory = resolve(directory);
  const manifestPath = join(directory, 'package.json');
  const action = async () => {
    const inventory = await scanProfile(directory, options.installAnchor);
    const report = checkCompatibility(inventory, runtimeVersion);
    const targets = options.targets ?? report.quarantine;
    for (const target of targets) {
      const plugin = inventory.find(x => x.name === target);
      if (!plugin || !plugin.enabled || plugin.protected) throw new Error(`不能隔离未启用或受保护的插件：${target}`);
    }
    if (!options.apply || !targets.length) return { applied: false, targets, report };
    const before = (await optionalText(manifestPath))!;
    const manifest = JSON.parse(before) as PackageManifest;
    const selected = manifest.dsh!.profile!.bundles;
    const removed = targets.map(name => ({ name, version: inventory.find(x => x.name === name)!.version, index: selected.indexOf(name) }));
    manifest.dsh!.profile!.bundles = selected.filter(x => !targets.includes(x));
    const after = `${JSON.stringify(manifest, null, 2)}\n`;
    const otherFiles: Record<string, string> = {};
    for (const name of ['cordis.patch.yml', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'compatibility.json']) {
      const text = await optionalText(join(directory, name)); if (text !== undefined) otherFiles[name] = text;
    }
    const record: RescueRecord = { schemaVersion: 1, id: randomUUID(), directory, createdAt: new Date().toISOString(),
      runtimeVersion, removed, before, beforeHash: digest(before), afterHash: digest(after), otherFiles, status: 'prepared' };
    const recordPath = join(directory, '.compat-guardian', 'rescue', `${record.id}.json`);
    await writeJson(recordPath, record);
    await atomicWrite(manifestPath, after);
    record.status = 'applied'; await writeJson(recordPath, record);
    return { applied: true, targets, report, recoveryId: record.id, recordPath };
  };
  // The lock filename and PID format match the official profile writer.
  return options.apply ? withLock(`${manifestPath}.lock`, action) : action();
}

export async function restoreRescue(directory: string, id: string, runtimeVersion: string, installAnchor?: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('恢复记录 ID 无效');
  directory = resolve(directory);
  const manifestPath = join(directory, 'package.json');
  return withLock(`${manifestPath}.lock`, async () => {
    const recordPath = join(directory, '.compat-guardian', 'rescue', `${id}.json`);
    const record = await readJson<RescueRecord>(recordPath);
    const currentText = (await optionalText(manifestPath))!;
    const interruptedAfterWrite = record.status === 'prepared' && digest(currentText) === record.afterHash;
    if (record.directory !== directory || (record.status !== 'applied' && !interruptedAfterWrite) || digest(record.before) !== record.beforeHash) throw new Error('恢复记录无效或已经恢复');
    const inventory = await scanProfile(directory, installAnchor);
    for (const target of record.removed) {
      const installed = inventory.find(x => x.name === target.name);
      if (!installed || installed.version !== target.version || installed.loadError) throw new Error(`${target.name} 的安装内容不可恢复，请先修复安装`);
    }
    const enabled = inventory.map(x => record.removed.some(r => r.name === x.name) ? { ...x, enabled: true } : x);
    const report = checkCompatibility(enabled, runtimeVersion);
    if (report.findings.some(x => x.severity === 'error' && x.plugins.some(name => record.removed.some(r => r.name === name)))) throw new Error('冲突仍存在，不能恢复');
    const raw = (await optionalText(manifestPath))!;
    const manifest = JSON.parse(raw) as PackageManifest;
    const selected = manifest.dsh?.profile?.bundles;
    if (!Array.isArray(selected)) throw new Error('当前 profile 无效');
    // Merge only our deselections; never overwrite edits made after recovery.
    for (const item of [...record.removed].sort((a, b) => a.index - b.index)) {
      if (!selected.includes(item.name)) selected.splice(Math.min(item.index, selected.length), 0, item.name);
    }
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    record.status = 'restored'; await writeJson(recordPath, record);
    return { restored: record.removed.map(x => x.name), recordPath };
  });
}
