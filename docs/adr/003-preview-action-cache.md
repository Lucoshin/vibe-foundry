---
project: VibeFoundry
category: adr
source_path: docs/adr/003-preview-action-cache.md
status: accepted
last_updated: 2026-09-01
---

# ADR-003：使用 Action Cache、SQLite 与内容寻址存储管理组件预览

> **实施状态（2026-09-01）：** 已完成。Action Cache 与 CAS 是唯一的组件预览缓存事实来源；首发前已删除旧静态目录、marker 和 `cacheKey` 读取兼容。

## 背景

当前组件预览把静态分析契约、构建状态和浏览器验证结果混合保存在 `component-previews.json`。`distill` 与单组件构建都会重写该文件，导致已验证状态丢失；磁盘产物只通过一个不完整的短缓存键识别，无法解释失效原因，也不能跨进程防止重复构建。

系统需要保证：服务重启不触发重建、相同动作并发只执行一次、失败不会随页面刷新无限重试、崩溃不会暴露半成品、缓存损坏可检测。

## 选项

### 重新分析时合并旧注册表状态

- 优点：改动小。
- 缺点：必须按组件字段猜测身份；状态、分析契约和生成时间继续耦合；无法解决并发、崩溃一致性和缓存校验。
- 结论：拒绝。

### 每组件 JSON manifest 与目录锁

- 优点：保持零依赖，容易手工检查。
- 缺点：事务、租约、索引、并发查询和垃圾回收最终会重复实现数据库能力。
- 结论：不作为长期事实来源。

### SQLite Action Cache 与内容寻址存储

- 优点：动作结果、租约和验证记录可事务化；产物按内容摘要不可变保存；分析快照只持有引用；可以实现单飞构建、失败缓存、完整性校验和可解释命中。
- 缺点：引入 SQLite 运行时依赖和数据迁移责任。
- 结论：采用。

## 决策

采用以下分层：

1. `component-previews.json` 只保存当前分析快照的静态预览契约和 `actionDigest`，不再保存可变构建事实。
2. SQLite 保存 Action Result、Validation Result 和跨进程 lease。数据库启用 WAL、foreign keys 和 busy timeout。
3. 预览动作使用规范化序列化与完整 SHA-256 摘要。摘要覆盖组件源码、传递依赖、场景、运行上下文、生成器、工具链、平台、构建选项和显式环境契约。
4. 构建产物先进入同文件系统临时目录，校验后写入按 SHA-256 寻址的不可变 CAS；数据库事务只能引用已经提交的 Artifact Tree。
5. Web 服务只投影构建与验证状态。重启只打开数据库并回收过期 lease，不进行组件构建。
6. 确定性失败按动作摘要持久化；瞬时失败使用有限次数和退避，不由页面刷新直接清除。
7. 缓存决策返回明确原因，例如 `HIT`、`MISS_ACTION`、`MISSING_ARTIFACT`、`CORRUPT_ARTIFACT` 和 `NEGATIVE_CACHE_HIT`。

SQLite 驱动采用 `better-sqlite3`，而不使用当前仍带实验警告的 `node:sqlite`。项目最低运行时升级到受支持的 Node.js LTS 版本，并以 lockfile 固定依赖版本。

## 不变量

- 相同 `ActionSpec` 必须产生相同 `actionDigest`。
- 数据库不得引用未完成提交或摘要不匹配的 CAS 对象。
- 同一 `actionDigest` 同时最多有一个有效构建 lease。
- `distill` 不复制、覆盖或猜测运行状态。
- 验证器升级只能使验证记录失效，不能使构建产物失效。
- 时间戳、PID、绝对输出路径和访问时间不得进入动作摘要。

## 后果

- 服务重启和重复 `distill` 可以稳定复用未变化组件。
- 首发前已取消旧静态目录导入；Action Cache `MISS` 时直接构建并提交 CAS。
- 数据库 schema 和动作 schema 都必须显式版本化。
- 需要垃圾回收、损坏修复和迁移测试。
- 旧 `.vibe-foundry-preview-cache-key` 的读取、写入及 `cacheKey` 兼容路径已在首发前删除。

## 验证方式

- 相同输入、不同对象键顺序产生相同动作摘要。
- 修改源码、场景、生成器或工具链分别导致动作摘要变化。
- 100 个并发请求同一动作只执行一次构建。
- 服务重启和重复 `distill` 后构建计数保持不变。
- 在临时写入、CAS 提交和数据库提交阶段注入失败，旧结果仍可读取且无半成品。
- 篡改 CAS 文件后返回 `CORRUPT_ARTIFACT`，不提供损坏内容。
- `npm test`、`npm run build`、真实项目 distill 与 GitNexus `detect_changes` 全部完成。
