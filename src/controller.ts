import { z } from 'zod';
import { parseRequest } from '../shared/rpc.ts';
import type { Guardian, RecoveryRecord } from './guardian.ts';

const policy = z.enum(['report', 'quarantine', 'remove']);
const requests = z.discriminatedUnion('action', [
  z.object({ action: z.literal('overview'), targetVersion: z.string().max(100).optional() }).strict(),
  z.object({ action: z.literal('repair'), policy, revision: z.string().length(64) }).strict(),
  z.object({ action: z.literal('restore'), recordId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('setPolicy'), policy }).strict(),
]);
export type GuardianOverview = Awaited<ReturnType<Guardian['overview']>>;
const publicRecord = ({ snapshot: _snapshot, ...record }: RecoveryRecord) => record;

export class GuardianController {
  private operation?: Promise<unknown>;
  private closed = false;
  constructor(readonly guardian: Guardian) {}
  async request(payload: string): Promise<string> {
    if (this.closed) throw new Error('插件正在关闭');
    const args = parseRequest(requests, payload);
    if (args.action === 'overview') return JSON.stringify(await this.guardian.overview(args.targetVersion));
    if (this.operation) throw new Error('正在处理另一项操作，请稍后重试');
    this.operation = (async () => {
      if (args.action === 'setPolicy') { await this.guardian.setPolicy(args.policy); return { policy: args.policy }; }
      if (args.action === 'restore') return publicRecord(await this.guardian.restore(args.recordId));
      const result = await this.guardian.reconcile(args.policy, args.revision);
      return { ...result, changes: result.changes.map(publicRecord) };
    })();
    try { return JSON.stringify(await this.operation); } finally { this.operation = undefined; }
  }
  async dispose(): Promise<void> { this.closed = true; await this.operation?.catch(() => {}); }
}
