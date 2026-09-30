# 故障与对照插件

九个包均为 `private: true`，只安装到临时测试 profile，不发布。

| 插件 | 故意制造的情况 | 实际验证 |
| --- | --- | --- |
| `dsh-fixture-service-owner` | 提供 `fixtureSharedParser`，作为正常对照 | 与冲突包并行加载，保留实际成功提供服务的一方 |
| `dsh-fixture-service-conflict` | 再次提供同名 Cordis 服务 | 真实注册冲突，失败方被隔离；不会先后停用双方 |
| `dsh-fixture-old-api` | 声明旧 DSH 范围，并调用不存在的接口 | 版本不兼容、实际加载失败、隔离与卸载；接口名是测试模拟 |
| `dsh-fixture-load-failure` | 加载时抛出 `INJECTED_LOAD_FAILURE` | 连续失败达到阈值后隔离；关闭故障开关后恢复 |
| `dsh-fixture-dependent` | 依赖上一个插件提供的服务和 bundle | 等待依赖不会直接算作崩溃；前置依赖隔离后联动停用，修复后一起恢复 |
| `dsh-fixture-missing-export` | 导入当前设置包不再导出的 `settingsNamespace` | 实际导入失败；离线停用后启动无此错误 |
| `dsh-fixture-invalid-config` | 向必需的数字端口字段传入字符串 | 实际 Schema 校验失败；离线救援 |
| `dsh-fixture-process-exit` | 加载时执行 `process.exit(73)` | 临时宿主真实退出；离线停用后正常启动 |
| `dsh-fixture-hanging-apply` | async apply 返回永不完成的 Promise | 临时宿主启动超时；离线停用后正常启动 |

`npm run test:conflicts` 使用官方 CLI 安装前五个包，启动真实 Web 宿主，读取 Cordis 的实际加载状态，通过实际 Plugin Manager 测试隔离、拒绝带冲突恢复、修复后恢复和卸载。摘要：`.test-output/conflict-report.json`。

`npm run test:startup` 分别启用后四个包，记录失败，再通过离线 rescue 停用并重新启动。摘要：`.test-output/startup-fault-report.json`。当前 DSH 0.2.0-rc.2 对缺失导出和配置错误允许降级启动，因此测试明确区分“条目失败但宿主已启动”与“宿主退出/超时”。

退出与挂起两个夹具只有在子进程环境变量 `DSH_TOOLKIT_ALLOW_FATAL_FIXTURE=1` 下才触发。加载异常夹具通过 `DSH_TOOLKIT_FAULT_REPAIRED=1` 模拟维护者修复。脚本只向测试子进程传入这些变量，不更改系统环境。

测试结束后清理临时 profile。网上故障来源、更多文件损坏与网络失败测试，以及尚未覆盖的范围见[故障覆盖表](../../../docs/failure-matrix.md)。
