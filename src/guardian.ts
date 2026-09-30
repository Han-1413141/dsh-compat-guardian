import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { checkCompatibility } from '../shared/compatibility.ts';
import { digest, optionalText, withLock, writeJson } from '../shared/files.ts';
import semver from 'semver';
import { scanProfile } from '../shared/profile.ts';
import type { CompatibilityReport, PluginRecord } from '../shared/types.ts';

// Profile foundations ship with DSH itself. Upgrade previews assume these are upgraded together;
// optional official plugins and every third-party package keep their installed constraints.
const runtimeCompanions = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless',
  '@deepseek-ai/dsh-sdk-app', '@deepseek-ai/dsh-sdk-minimal', '@deepseek-ai/dsh-acp-app']);

export interface ManagedBundle {
  name: string; version?: string; enabled: boolean; removable: boolean; installed: boolean;
  readOnlyReason?: string; error?: { code: string; diagnostic?: string };
  rows: { rowId: string; moduleName: string; entryId?: string }[];
}
export interface ManagedPlugin { entryId: string; moduleName: string; enabled: boolean; fiberPhase: string | null }
export interface ChangeResult {
  changed: boolean; application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled';
  stage: string; target: string; error?: unknown;
}
export interface PluginManagerAdapter {
  listBundles(): Promise<ManagedBundle[]>;
  listPlugins(): Promise<ManagedPlugin[]>;
  setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>;
  removeBundle(name: string): Promise<ChangeResult>;
}
export type Policy = 'report' | 'quarantine' | 'remove';
export interface RecoveryRecord {
  id: string; at: string; plugin: string; version: string; runtimeVersion: string;
  status: 'prepared' | 'quarantined' | 'removed' | 'restored' | 'failed' | 'superseded';
  reason: string[];
  snapshot: { files: Record<string, string>; bundles: string[] };
  result?: ChangeResult; error?: string;
  removalPending?: boolean;
}
export interface GuardianState {
  schemaVersion: 1; runtimeVersion?: string;
  failures: Record<string, number>;
  records: RecoveryRecord[];
}
export interface GuardianOptions {
  directory: string; runtimeVersion: string; installAnchor?: string; policy?: Policy;
  failureThreshold?: number; scan?: () => Promise<PluginRecord[]>;
}
export class Guardian {
  readonly options: GuardianOptions;
  readonly manager: PluginManagerAdapter;
  private statePath: string;
  private attemptedRemovals = new Set<string>();
  constructor(manager: PluginManagerAdapter, options: GuardianOptions) {
    this.manager = manager; this.options = options;
    this.statePath = join(options.directory, '.compat-guardian', 'state.json');
    if (options.policy && !['report', 'quarantine', 'remove'].includes(options.policy)) throw new Error('无效的 guardian policy');
    if (options.failureThreshold !== undefined && (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1)) throw new Error('failureThreshold 必须为正整数');
  }
  async state(): Promise<GuardianState> {
    const raw = await optionalText(this.statePath);
    if (!raw) return { schemaVersion: 1, failures: {}, records: [] };
    const state = JSON.parse(raw) as GuardianState;
    if (state.schemaVersion !== 1 || !Array.isArray(state.records) || !state.failures) throw new Error('Guardian 状态文件格式无效');
    return state;
  }
  private async snapshot(bundles: ManagedBundle[]): Promise<RecoveryRecord['snapshot']> {
    const files: Record<string, string> = {};
    for (const name of ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'compatibility.json']) {
      const text = await optionalText(join(this.options.directory, name));
      if (text !== undefined) files[name] = text;
    }
    return { files, bundles: bundles.filter(x => x.enabled).map(x => x.name) };
  }
  async inspect(): Promise<CompatibilityReport> {
    const records = await this.inventory();
    return checkCompatibility(records, this.options.runtimeVersion, this.liveOptions(records));
  }
  private liveOptions(records: PluginRecord[]) { return { activePlugins: new Set(records.filter(x => x.state === 'active' && !x.loadError).map(x => x.name)) }; }
  async policy(): Promise<Policy> {
    const raw = await optionalText(join(this.options.directory, '.compat-guardian', 'preferences.json'));
    const policy: Policy = raw ? JSON.parse(raw).policy : this.options.policy ?? 'quarantine';
    if (!['report', 'quarantine', 'remove'].includes(policy)) throw new Error('保存的自动处理策略无效');
    return policy;
  }
  async setPolicy(policy: Policy): Promise<void> {
    if (!['report', 'quarantine', 'remove'].includes(policy)) throw new Error('无效策略');
    await withLock(join(this.options.directory, '.compat-guardian', 'operation.lock'), () =>
      writeJson(join(this.options.directory, '.compat-guardian', 'preferences.json'), { policy }));
  }
  private revision(inventory: PluginRecord[], state: GuardianState): string {
    return digest(JSON.stringify({ inventory, pending: state.records.filter(x => x.removalPending).map(x => [x.id, x.status, x.version]) }));
  }
  async overview(targetVersion: string = this.options.runtimeVersion) {
    if (!semver.valid(targetVersion)) throw new Error('请输入完整的 DSH 版本，例如 0.2.0-rc.2');
    const inventory = await this.inventory(), state = await this.state();
    const forecast = targetVersion !== this.options.runtimeVersion;
    const projected = forecast ? inventory.map(x => runtimeCompanions.has(x.name) ? { ...x, version: targetVersion } : x) : inventory;
    return { runtimeVersion: this.options.runtimeVersion, targetVersion, checkedAt: new Date().toISOString(),
      profile: this.options.directory, policy: await this.policy(), revision: this.revision(inventory, state),
      report: checkCompatibility(projected, targetVersion, { ...this.liveOptions(inventory), ...(forecast ? { runtimeCompanions } : {}) }),
      plugins: inventory.map(({ name, version, enabled, protected: protectedPlugin, loadError }) => ({ name, version, enabled, protected: protectedPlugin, loadError })),
      records: state.records.slice(-100).reverse().map(({ snapshot: _snapshot, ...record }) => record),
    };
  }
  private async inventory(): Promise<PluginRecord[]> {
    const [records, bundles, plugins] = await Promise.all([
      this.options.scan?.() ?? scanProfile(this.options.directory, this.options.installAnchor),
      this.manager.listBundles(), this.manager.listPlugins(),
    ]);
    return records.map(record => {
      const bundle = bundles.find(x => x.name === record.name);
      if (!bundle) return record;
      const failed = bundle.rows.filter(row => plugins.some(x => x.entryId === row.entryId && x.enabled && x.fiberPhase === 'failed'));
      const observed = plugins.filter(x => x.enabled && bundle.rows.some(row => x.entryId === row.entryId));
      return { ...record, version: record.version === 'unknown' ? bundle.version ?? record.version : record.version,
        enabled: bundle.enabled, removable: bundle.removable,
        ...(observed.length && observed.every(x => x.fiberPhase === 'active') ? { state: 'active' as const } : {}),
        protected: record.protected || bundle.readOnlyReason === 'management-required',
        ...(bundle.error ? { loadError: `${bundle.error.code}: ${bundle.error.diagnostic ?? ''}` } : {}),
        ...(failed.length ? { loadError: `加载失败的插件条目：${failed.map(x => x.rowId).join('、')}`, state: 'failed' as const } : {}) };
    });
  }
  private async removeQuarantined(record: RecoveryRecord): Promise<void> {
    if (this.attemptedRemovals.has(record.id)) return;
    this.attemptedRemovals.add(record.id);
    const bundle = (await this.manager.listBundles()).find(x => x.name === record.plugin);
    if (!bundle?.installed) { record.status = 'removed'; record.removalPending = false; return; }
    if (bundle.enabled || !bundle.removable || bundle.version !== record.version) {
      record.removalPending = false; record.error = '插件状态、版本或移除权限已改变，取消待执行卸载'; return;
    }
    try {
      record.result = await this.manager.removeBundle(record.plugin);
      if (!['applied', 'restart-required'].includes(record.result.application)) throw new Error(`卸载未完成：${JSON.stringify(record.result)}`);
      if ((await this.manager.listBundles()).some(x => x.name === record.plugin && x.installed)) throw new Error('卸载后依赖仍存在');
      record.status = 'removed'; record.removalPending = false; delete record.error;
    } catch (error) { record.error = String(error); }
  }
  async reconcile(requestedPolicy?: Policy, expectedRevision?: string): Promise<{ report: CompatibilityReport; changes: RecoveryRecord[]; runtimeChanged: boolean }> {
    return withLock(join(this.options.directory, '.compat-guardian', 'operation.lock'), async () => {
      const policy = requestedPolicy ?? await this.policy();
      if (!['report', 'quarantine', 'remove'].includes(policy)) throw new Error('无效策略');
      const state = await this.state();
      const runtimeChanged = state.runtimeVersion !== undefined && state.runtimeVersion !== this.options.runtimeVersion;
      state.runtimeVersion = this.options.runtimeVersion;
      const inventory = await this.inventory();
      if (expectedRevision && this.revision(inventory, state) !== expectedRevision) throw new Error('插件状态已变化，请刷新检查结果后重试');
      const observedBundles = await this.manager.listBundles();
      for (const record of state.records.filter(x => x.status === 'prepared' || x.status === 'quarantined')) {
        const observed = observedBundles.find(x => x.name === record.plugin);
        if (!observed?.installed) { record.status = 'removed'; record.removalPending = false; }
        else if (observed.version === record.version && !observed.enabled) record.status = 'quarantined';
        else if (record.status === 'quarantined') {
          record.status = observed.version === record.version ? 'restored' : 'superseded';
          record.removalPending = false; delete record.error; delete record.result;
        }
        else if (record.status === 'prepared') { record.status = 'failed'; record.error = '上一次处理被中断，当前插件仍启用或版本已变化'; }
      }
      const threshold = this.options.failureThreshold ?? 2;
      const currentKeys = new Set(inventory.map(x => `${x.name}@${x.version}|${this.options.runtimeVersion}`));
      for (const key of Object.keys(state.failures)) if (!currentKeys.has(key)) delete state.failures[key];
      for (const record of inventory) {
        const key = `${record.name}@${record.version}|${this.options.runtimeVersion}`;
        if (record.enabled && record.loadError) state.failures[key] = (state.failures[key] ?? 0) + 1;
        else delete state.failures[key];
      }
      // Version/declared conflicts are certain; transient live failures need repeated observations.
      const stable = inventory.map(record => {
        const key = `${record.name}@${record.version}|${this.options.runtimeVersion}`;
        if ((state.failures[key] ?? 0) >= threshold) return record;
        return { ...record, loadError: undefined, state: record.state === 'failed' ? 'pending' as const : record.state };
      });
      const report = checkCompatibility(stable, this.options.runtimeVersion, this.liveOptions(inventory));
      const changes: RecoveryRecord[] = [];
      await writeJson(this.statePath, state);
      if (policy === 'report') return { report, changes, runtimeChanged };
      if (policy === 'remove') {
        for (const pending of state.records.filter(x => x.status === 'quarantined' && x.removalPending && !this.attemptedRemovals.has(x.id))) {
          const target = inventory.find(x => x.name === pending.plugin);
          if (target?.protected) continue;
          await this.removeQuarantined(pending); changes.push(pending);
          await writeJson(this.statePath, state);
        }
      }
      for (const name of report.quarantine) {
        const target = inventory.find(x => x.name === name)!;
        const current = await this.manager.listBundles();
        const bundle = current.find(x => x.name === name);
        if (!bundle?.enabled || target.protected || (bundle.version && bundle.version !== target.version)) continue;
        const record: RecoveryRecord = { id: randomUUID(), at: new Date().toISOString(), plugin: name,
          version: target.version, runtimeVersion: this.options.runtimeVersion, status: 'prepared',
          reason: report.findings.filter(x => x.plugins.includes(name)).map(x => x.message), snapshot: await this.snapshot(current) };
        if (!record.reason.length) record.reason.push('依赖插件被隔离，联动停用依赖它的插件');
        state.records.push(record); changes.push(record);
        // Persist recovery material before the first mutation, including interrupted operations.
        await writeJson(this.statePath, state);
        try {
          record.result = await this.manager.setBundleEnabled(name, false);
          if (!['applied', 'restart-required'].includes(record.result.application)) throw new Error(`停用未生效：${JSON.stringify(record.result)}`);
          const after = (await this.manager.listBundles()).find(x => x.name === name);
          if (after?.enabled) throw new Error('停用后仍被选中，请检查更高优先级配置');
          record.status = 'quarantined';
          record.removalPending = policy === 'remove' && bundle.removable && target.removable;
          await writeJson(this.statePath, state);
          if (record.removalPending) await this.removeQuarantined(record);
        } catch (error) { record.error = String(error); if (record.status === 'prepared') record.status = 'failed'; }
        await writeJson(this.statePath, state);
      }
      return { report, changes, runtimeChanged };
    });
  }
  async restore(id: string): Promise<RecoveryRecord> {
    return withLock(join(this.options.directory, '.compat-guardian', 'operation.lock'), async () => {
      const state = await this.state();
      const record = state.records.find(x => x.id === id);
      if (!record || record.status !== 'quarantined') throw new Error('只能恢复仍然保留安装文件的隔离记录；已卸载插件需先重新安装原版本');
      const inventory = await this.inventory();
      const target = inventory.find(x => x.name === record.plugin);
      if (!target || target.version !== record.version) throw new Error('插件版本已变化，请检查新版本后单独启用');
      const report = checkCompatibility(inventory.map(x => x.name === target.name ? { ...x, enabled: true, loadError: undefined, state: 'active' as const } : x), this.options.runtimeVersion);
      if (report.findings.some(x => x.severity === 'error' && x.plugins.includes(target.name))) throw new Error('兼容性冲突仍存在，恢复被拒绝');
      const result = await this.manager.setBundleEnabled(target.name, true);
      if (!['applied', 'restart-required'].includes(result.application)) throw new Error(`恢复失败：${JSON.stringify(result)}`);
      if (!(await this.manager.listBundles()).find(x => x.name === target.name)?.enabled) throw new Error('恢复未持久化');
      record.status = 'restored'; record.result = result; record.removalPending = false;
      delete record.error;
      await writeJson(this.statePath, state);
      return record;
    });
  }
}
