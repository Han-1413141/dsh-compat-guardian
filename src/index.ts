import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot';
import type {} from '@deepseek-ai/dsh-plugin-manager';
import { approve } from '../shared/approval.ts';
import { Guardian, type Policy } from './guardian.ts';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { GuardianController } from './controller.ts';

class CompatGuardianUI extends TypertRemoteService {
  constructor(ctx: Context, private controller: GuardianController) { super(ctx, 'compatGuardianUI'); }
  @Remote async request(payload: string): Promise<string> { return this.controller.request(payload); }
}

export const name = 'dsh-compat-guardian';
export const inject = ['tools', 'sandboxPolicy', 'pluginManager', 'profileContext'];
export interface Config { policy?: Policy; intervalMs?: number; failureThreshold?: number }
export function apply(ctx: Context, config: Config = {}): void {
  const guardian = new Guardian(ctx.pluginManager, { directory: ctx.profileContext.dir, installAnchor: ctx.profileContext.installAnchor,
    runtimeVersion: getDshRuntimeVersion(), policy: config.policy ?? 'quarantine', failureThreshold: config.failureThreshold });
  const controller = new GuardianController(guardian);
  new CompatGuardianUI(ctx, controller);
  ctx.effect(() => () => controller.dispose(), 'compat-guardian: browser operations');
  const intervalMs = config.intervalMs ?? 30000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 5000) throw new Error('intervalMs 必须至少为 5000 毫秒');
  let disposed = false, operation: Promise<unknown> | undefined;
  const monitor = () => {
    if (disposed || operation) return;
    operation = guardian.reconcile().then(result => {
      if (result.changes.length) ctx.logger.info(`兼容性处理：${result.changes.map(x => `${x.plugin}: ${x.status}`).join('；')}`);
    }).catch(error => ctx.logger.warn(`兼容性检查失败：${String(error)}`)).finally(() => { operation = undefined; });
  };
  const start = setTimeout(monitor, 5000); start.unref();
  const timer = setInterval(monitor, intervalMs); timer.unref();
  ctx.effect(() => async () => { disposed = true; clearTimeout(start); clearInterval(timer); await operation; }, 'compat-guardian: stop monitor');
  ctx.tools.register(defineTool({
    name: 'compat_guardian',
    description: '检查 DSH 插件版本、插件间冲突和加载失败。check 只读；repair 按配置执行隔离/卸载并先保存恢复记录；restore 在冲突消失后恢复隔离插件。history 列出处理记录。自动策略通过插件配置 policy=report/quarantine/remove 设置。',
    parameters: {
      action: { type: 'string', required: true, enum: ['check', 'repair', 'restore', 'history'] },
      recordId: { type: 'string', description: 'restore 的隔离记录 ID。' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (args.action === 'check') return JSON.stringify(await guardian.inspect());
      if (args.action === 'history') {
        const state = await guardian.state();
        return JSON.stringify(state.records.map(({ snapshot: _snapshot, ...record }) => record));
      }
      const report = args.action === 'repair' ? await guardian.inspect() : undefined;
      await approve(ctx, exec, 'plugin compatibility recovery', `${args.action}; policy=${await guardian.policy()}; targets=${report?.quarantine.join(', ') ?? args.recordId}; profile=${ctx.profileContext.name}. 修改影响该 profile 的全部会话。`);
      return JSON.stringify(args.action === 'restore' ? await guardian.restore(args.recordId ?? '') : await guardian.reconcile());
    },
  }));
}
