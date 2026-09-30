import type { Context } from '@deepseek-ai/cordis';
import { useState } from 'react';
import { Button, Input, Modal, Tag, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { mountPanel, useOverview, date, type PanelProps } from '../shared/ui/panel.tsx';
import { Empty, Notice } from '../shared/ui/components.tsx';
import type { GuardianOverview } from './controller.ts';
import type { Policy, RecoveryRecord } from './guardian.ts';
import { TYPERT_REMOTE } from './typert.ts';

export const inject = ['slots', 'locale', 'remote', 'layout'];
export const apply = (ctx: Context) => mountPanel(ctx, { id: 'dsh-compat-guardian', title: '兼容守护', english: 'Compatibility', service: 'compatGuardianUI', contribution: TYPERT_REMOTE, component: GuardianPanel, guardian: true });
const policyLabels = { report: '仅报告', quarantine: '自动隔离', remove: '隔离后自动卸载' };
const recordLabels = { prepared: '处理中', quarantined: '已隔离', removed: '已卸载', restored: '已恢复', failed: '处理失败', superseded: '版本已变化' };
type Confirmation = { kind: 'repair'; snapshot: GuardianOverview; policy: Policy } | { kind: 'policy'; policy: Policy } | { kind: 'restore'; id: string; plugin: string };

export function GuardianPanel({ call }: PanelProps) {
  const [targetInput, setTargetInput] = useState(''), [targetVersion, setTargetVersion] = useState<string>();
  const { value, error, refresh } = useOverview<GuardianOverview>(call, { action: 'overview', ...(targetVersion ? { targetVersion } : {}) });
  const [operationError, setOperationError] = useState('');
  const [tab, setTab] = useState<'findings' | 'plugins' | 'history'>('findings');
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const forecast = !!value && value.targetVersion !== value.runtimeVersion;
  const errors = value?.report.findings.filter(x => x.severity === 'error') ?? [];
  const quarantined = value?.records.filter(x => x.status === 'quarantined') ?? [];
  const matches = (text: string) => text.toLowerCase().includes(query.toLowerCase().trim());
  const findings = (value?.report.findings.filter(x => matches(`${x.plugins.join(' ')} ${x.message}`)) ?? [])
    .sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'));
  const plugins = value?.plugins.filter(x => matches(x.name)) ?? [];
  const records = value?.records.filter(x => matches(`${x.plugin} ${x.reason.join(' ')}`)) ?? [];
  const targets = confirmation?.kind === 'repair' ? [...new Set([...confirmation.snapshot.report.quarantine,
    ...(confirmation.policy === 'remove' ? confirmation.snapshot.records.filter(x => x.removalPending).map(x => x.plugin) : [])])] : [];
  const perform = async () => {
    if (!confirmation) return;
    setBusy(true); setOperationError(''); setNotice('');
    try {
      if (confirmation.kind === 'policy') {
        await call({ action: 'setPolicy', policy: confirmation.policy }); setNotice(`自动策略已更新：${policyLabels[confirmation.policy]}。`);
      } else if (confirmation.kind === 'restore') {
        const result = await call<Omit<RecoveryRecord, 'snapshot'>>({ action: 'restore', recordId: confirmation.id });
        setNotice(result.result?.application === 'restart-required' ? '启用设置已保存，重启 DSH 后生效。' : '插件已恢复。');
      } else {
        const result = await call<{ changes: Omit<RecoveryRecord, 'snapshot'>[] }>({ action: 'repair', policy: confirmation.policy, revision: confirmation.snapshot.revision });
        const failures = result.changes.filter(x => x.error || x.status === 'failed');
        if (failures.length) setOperationError(failures.map(x => `${x.plugin}：${x.error ?? '处理失败'}`).join('；'));
        setNotice(result.changes.length ? `已处理 ${result.changes.length} 条记录。${result.changes.some(x => x.result?.application === 'restart-required') ? '部分操作需要重启 DSH。' : '详情已保存到恢复记录。'}` : '本次没有处理插件；暂态加载失败需要连续观察后才会隔离。');
      }
      setConfirmation(undefined); refresh();
    } catch (cause) { setOperationError(String(cause)); setConfirmation(undefined); refresh(); } finally { setBusy(false); }
  };
  return <div className="dsh-kit"><main className="kit-content" aria-label="兼容守护工作台">
    <header className="kit-header"><div><h1>兼容守护</h1><p className="kit-muted">检查插件冲突，预检 DSH 升级，并保留每次处理记录。</p></div><Button variant="outline" disabled={busy} icon={<IconRefreshOutlineRegular size={16} />} onClick={() => { setNotice(''); refresh(); }}>重新检查</Button></header>
    {error && <Notice tone="error">{error}</Notice>}{operationError && <Notice tone="error">{operationError}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {!value && !error && <Notice>正在读取插件状态和兼容声明…</Notice>}
    {value && <>
      <section className="kit-card kit-stack"><div className="kit-row"><div><h2>{forecast ? `升级预检 · ${value.targetVersion}` : errors.length ? '发现需要处理的兼容问题' : '未发现已知兼容冲突'}</h2><p className="kit-muted">当前 DSH {value.runtimeVersion} · {date(value.checkedAt)} 检查</p></div><Tag tone={forecast ? 'info' : errors.length ? 'warning' : 'success'}>{forecast ? '预检结果' : errors.length ? '需要处理' : '检查完成'}</Tag></div>
        <div className="kit-counts"><div className="kit-count"><b>{value.plugins.filter(x => x.enabled).length}</b><span className="kit-muted">已启用插件</span></div><div className="kit-count"><b>{errors.length}</b><span className="kit-muted">{forecast ? '目标版本冲突' : '兼容冲突'}</span></div><div className="kit-count"><b>{quarantined.length}</b><span className="kit-muted">隔离记录</span></div></div>
        <div className="kit-row"><span className="kit-muted">自动处理</span><select aria-label="自动处理策略" disabled={busy} value={value.policy} onChange={e => setConfirmation({ kind: 'policy', policy: e.target.value as Policy })}>{Object.entries(policyLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
        <p className="kit-caption">隔离会停用插件并保存恢复资料。缺少兼容声明只会提示，不会触发隔离。{value.policy === 'remove' ? '当前策略会在隔离后卸载不兼容插件。' : ''}</p>
      </section>
      <section className="kit-card kit-stack"><div><h2>升级前，先检查</h2><p className="kit-muted">输入准备升级到的 DSH 版本，检查现有插件的版本约束。</p></div><form className="kit-row" onSubmit={e => { e.preventDefault(); setTargetVersion(targetInput.trim() || undefined); refresh(); }}><label className="kit-field" style={{ flex: 1 }}><span className="kit-caption">目标 DSH 版本</span><Input placeholder={`例如 ${value.runtimeVersion}`} value={targetInput} maxLength={100} onChange={e => setTargetInput(e.target.value)} /></label><Button type="submit" variant="outline" disabled={busy || !targetInput.trim()}>预检升级</Button>{forecast && <Button onClick={() => { setTargetVersion(undefined); setTargetInput(''); }}>返回当前版本</Button>}</form>
        {forecast && <Notice>预检不会修改插件。此处按官方基础组件随 DSH 一起升级计算，其他插件保持现有版本；检查已声明的版本和依赖约束，实际加载行为仍需在新版本验证。</Notice>}
      </section>
      <div className="kit-row"><nav className="kit-tabs" role="tablist" aria-label="兼容守护视图">{(['findings', 'plugins', 'history'] as const).map(x => <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>{x === 'findings' ? '检查结果' : x === 'plugins' ? '插件列表' : '恢复记录'}</button>)}</nav><Input aria-label="筛选插件" placeholder="搜索插件或问题" value={query} onChange={e => setQuery(e.target.value)} /></div>
      {tab === 'findings' && <section className="kit-card kit-stack"><div className="kit-row"><h2>检查结果 <span className="kit-version">{findings.length}</span></h2><div className="kit-actions"><Button variant="outline" disabled={busy || forecast || (!value.report.quarantine.length && !value.records.some(x => x.removalPending))} onClick={() => setConfirmation({ kind: 'repair', policy: 'remove', snapshot: value })}>隔离并卸载</Button><Button variant="primary" disabled={busy || forecast || !value.report.quarantine.length} onClick={() => setConfirmation({ kind: 'repair', policy: 'quarantine', snapshot: value })}>隔离冲突插件</Button></div></div>
        {findings.length ? <ul className="kit-list">{findings.map((x, i) => <li key={i}><div className="kit-actions"><Tag tone={x.severity === 'error' ? 'danger' : 'warning'}>{x.severity === 'error' ? '冲突' : '提示'}</Tag><span className="kit-package">{x.plugins.join(' / ')}</span></div><p className="kit-muted kit-break">{x.message}</p></li>)}</ul> : <Empty title={query ? '没有匹配的结果' : '当前检查通过'}>{query ? '尝试输入其他插件名称。' : '版本约束、已声明的冲突和插件加载状态没有报告问题。'}</Empty>}
        {!!value.report.unresolved.length && <Notice tone="warning">部分冲突涉及受保护组件，无法自动处理。请查看相关提示并更新对应插件。</Notice>}
      </section>}
      {tab === 'plugins' && <section className="kit-card kit-stack"><h2>插件列表 <span className="kit-version">{plugins.length}</span></h2><ul className="kit-list">{plugins.map(x => <li key={x.name}><div className="kit-row"><span className="kit-package">{x.name}<span className="kit-version">{x.version}</span></span><div className="kit-chips">{x.protected && <Tag>受保护</Tag>}<Tag tone={x.loadError ? 'danger' : x.enabled ? 'success' : 'neutral'}>{x.loadError ? '加载失败' : x.enabled ? '已启用' : '已停用'}</Tag></div></div>{x.loadError && <p className="kit-muted kit-break">{x.loadError}</p>}</li>)}</ul>{!plugins.length && <Empty title="没有匹配的插件">调整搜索条件后重试。</Empty>}</section>}
      {tab === 'history' && <section className="kit-card kit-stack"><h2>恢复记录</h2>{records.length ? <ul className="kit-list">{records.map(x => <li key={x.id}><div className="kit-row"><span className="kit-package">{x.plugin}<span className="kit-version">{x.version}</span></span><Tag tone={x.status === 'failed' ? 'danger' : x.status === 'restored' ? 'success' : 'neutral'}>{recordLabels[x.status]}</Tag></div><p className="kit-caption">{date(x.at)} · DSH {x.runtimeVersion}{x.result?.application === 'restart-required' ? ' · 需要重启' : ''}</p><p className="kit-muted kit-break">{x.reason.join('；')}</p>{x.error && <p className="kit-break">{x.error}</p>}{x.removalPending && <p className="kit-muted">卸载待完成；安装文件仍保留。</p>}{x.status === 'removed' ? <p className="kit-caption">恢复前需重新安装对应版本，再检查兼容性。</p> : x.status === 'quarantined' && <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmation({ kind: 'restore', id: x.id, plugin: x.plugin })}>检查并恢复</Button>}</li>)}</ul> : <Empty title="还没有恢复记录">隔离和卸载前会保存配置，处理原因与结果会显示在这里。</Empty>}</section>}
      <details><summary>检查范围</summary><p className="kit-muted kit-break">当前配置：{value.profile}</p><p className="kit-muted">检查版本约束、依赖、明确声明的冲突、重复注册和加载失败。未声明的运行时行为无法通过静态检查完全判断。若 DSH 已无法启动，可使用随插件提供的离线救援命令。</p></details>
    </>}
    <Modal open={!!confirmation} onClose={() => { if (!busy) setConfirmation(undefined); }} title={confirmation?.kind === 'policy' ? '更新自动处理策略' : confirmation?.kind === 'restore' ? '恢复隔离的插件' : confirmation?.policy === 'remove' ? '隔离并卸载插件' : '隔离冲突插件'} closeLabel="关闭" className="dsh-kit-dialog" footer={<><Button disabled={busy} onClick={() => setConfirmation(undefined)}>取消</Button><Button variant="primary" disabled={busy} onClick={() => void perform()}>{busy ? '正在处理…' : '确认处理'}</Button></>}>
      {confirmation?.kind === 'repair' ? <><p>以下插件将被{confirmation.policy === 'remove' ? '停用并卸载。卸载后需要重新安装才能恢复' : '停用，安装文件和恢复资料会保留'}。</p><ul className="kit-break">{targets.map(x => <li key={x}>{x}</li>)}</ul><p className="kit-muted">操作影响当前配置中的全部会话。确认时将再次检查插件状态；连续加载失败未达到阈值的插件暂不处理。</p></> : confirmation?.kind === 'restore' ? <><p className="kit-break">{confirmation.plugin}</p><p>重新检查依赖和兼容性，通过后启用。冲突仍存在时会保留隔离状态。</p></> : confirmation?.kind === 'policy' ? <><p>新策略：{policyLabels[confirmation.policy]}</p><p>{confirmation.policy === 'report' ? '之后只记录兼容问题，不自动修改插件。' : confirmation.policy === 'quarantine' ? '之后发现确定冲突或连续加载失败时，自动保存恢复资料并停用相关插件。' : '之后发现确定冲突或连续加载失败时，自动保存恢复资料、停用并卸载相关插件。已卸载插件需重新安装才能恢复。'}</p><p className="kit-muted">设置会保存，并在下一次自动检查时生效。</p></> : null}
    </Modal>
  </main></div>;
}
