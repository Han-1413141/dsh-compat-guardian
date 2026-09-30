#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { rescueProfile, restoreRescue } from './rescue.ts';

const help = `dsh-compat-guardian ${createRequire(import.meta.url)('../package.json').version}
  check --profile-dir <目录> --dsh-version <目标版本>
  rescue --profile-dir <目录> --dsh-version <版本> [--yes] [--plugins <包名,包名>]
  restore --profile-dir <目录> --dsh-version <版本> --id <recoveryId> --yes

可选：--install-anchor <DSH 安装包的 package.json>
check 和未加 --yes 的 rescue 只读。rescue 停用冲突插件并保存原配置，不加载第三方代码。
rescue/restore 用于 DSH 已关闭后的启动修复；在线使用 compat_guardian 工具。`;

async function main() {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: {
    'profile-dir': { type: 'string' }, 'dsh-version': { type: 'string' }, 'install-anchor': { type: 'string' },
    plugins: { type: 'string' }, id: { type: 'string' }, yes: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  const command = positionals[0];
  if (!command || args.help) { console.log(help); return; }
  if (!args['profile-dir'] || !args['dsh-version']) throw new Error('必须提供 --profile-dir 和 --dsh-version');
  const directory = resolve(args['profile-dir']), runtime = args['dsh-version'];
  let anchor = args['install-anchor'] ? resolve(args['install-anchor']) : undefined;
  if (!anchor) { try { anchor = createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'); } catch {} }
  let result: unknown;
  if (command === 'check' || command === 'rescue') {
    result = await rescueProfile(directory, runtime, { apply: command === 'rescue' && args.yes === true, installAnchor: anchor,
      targets: command === 'rescue' ? args.plugins?.split(',').map(x => x.trim()).filter(Boolean) : undefined });
    if (command === 'check' && (result as Awaited<ReturnType<typeof rescueProfile>>).report.findings.some(x => x.severity === 'error')) process.exitCode = 2;
  } else if (command === 'restore') {
    if (!args.yes) throw new Error('恢复配置需要 --yes');
    result = await restoreRescue(directory, args.id ?? '', runtime, anchor);
  } else throw new Error(`未知命令：${command}`);
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
