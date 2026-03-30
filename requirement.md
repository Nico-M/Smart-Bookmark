## 书签整理扩展 PRD v1

### 1. 产品目标
开发一个 Edge 浏览器扩展，帮助用户整理全部书签，提供 AI 分类、去重、分类结果确认与回滚能力，并提供独立页面进行书签浏览与管理。

### 2. 范围与平台
1. 平台：Edge 浏览器扩展（Manifest V3）。
2. 整理范围：默认处理用户全部书签。
3. 页面形态：扩展打开独立页面（新 tab），不替换浏览器默认 New Tab。
4. 技术栈：React + TypeScript + neobrutalism components（https://www.neobrutalism.dev/docs/installation）。

### 3. 功能需求
#### 3.1 书签整理
1. AI 分类：对书签进行智能分类（分类名由 AI 生成）。
2. 去重：按 URL 归一化规则识别重复项并支持删除重复项。
3. 重命名：仅对“分组/文件夹名称”进行 AI 命名优化，不修改具体站点书签标题。

#### 3.2 分类流程
1. 前置条件：用户必须先配置 OpenAI 参数，否则禁用分类功能并提示配置。
2. 生成分类结果：调用 OpenAI SDK 获取分类建议。
3. 结果预览：展示分类后的目录结构、移动数量、去重数量。
4. 用户决策：
   1. 接受并写回。
   2. 重新分类（支持全量重跑和局部重跑）。
5. 写回策略：先创建备份，再覆盖写回浏览器书签结构。
6. 回滚能力：支持一键撤销本次整理（基于备份恢复）。

#### 3.3 管理页面（扩展独立 tab）
1. 书签列表展示。
2. 搜索与筛选。
3. 书签删除。
4. 书签编辑（含分组命名相关编辑能力）。

### 4. OpenAI 配置与使用
1. 配置项：`API Key`、`Base URL`、`Model`。
2. 密钥存储：v1 使用本地明文存储（`chrome.storage.local`）。
3. 数据发送策略：允许发送书签标题 + URL 给 AI 接口用于分类。

### 5. MVP 范围（已确认）
1. AI 分类 + 预览确认 + 写回。
2. 去重。
3. 分组命名优化（AI 命名 group）。
4. 新 tab 搜索/筛选。
5. 新 tab 编辑（改名/删除）。
6. 一键回滚（撤销本次整理）。

### 6. 非功能要求（v1）
1. 性能：暂不设硬性时延指标，优先保证结果正确性与可回滚。
2. 可靠性：分类、写回、回滚流程需有明确错误提示。
3. 可用性：关键操作（写回、删除、回滚）需要二次确认。

### 7. 验收标准（v1）
1. 未配置 OpenAI 参数时，分类入口不可用且有引导提示。
2. 触发分类后可看到预览结果，并可选择接受或重新分类。
3. 选择“接受”后，系统先备份再写回；写回后书签结构可见变更。
4. 去重能识别并处理 URL 归一化后重复书签。
5. 分组名称可由 AI 生成，不改动站点书签标题。
6. 可在管理页面完成搜索、筛选、删除和编辑。
7. 可通过“一键回滚”恢复到本次整理前状态。

### 8. 已确认实现规则
1. URL 归一化规则：
   1. 去除跟踪参数（`utm_*`、`fbclid`、`gclid`）。
   2. 去除 URL hash（`#...`）。
   3. 域名小写化。
   4. 去除末尾 `/`。
   5. `http` 与 `https` 视为同一网址。
2. 局部重跑粒度：按文件夹重跑。
3. 备份保留策略：保留最近 5 次。
4. 回滚有效期：仅当前会话（重启浏览器后不可回滚历史备份）。
5. AI 调用策略预设（均衡）：
   1. 单次请求超时 `30s`。
   2. 失败自动重试 `2` 次。
6. 错误处理策略：
   1. `401` 立即提示检查 `API Key`。
   2. `429` 自动退避重试。
   3. 写回失败自动回滚。
   4. 所有失败写入本地日志。

### 9. 风险与后续建议
1. 已确认采用会话级回滚：保留最近 5 次备份仅用于当前会话内回滚，不提供跨会话历史回滚能力。
2. `API Key` 明文存储可用于 MVP，但不建议直接用于公开发布版本。



### 10. 开发约束
1. 函数需要中文注释。
2. 保持代码简洁，重复逻辑需要提取为公共模块。
3. tab页面的UI风格必须是 neobrutalism(https://www.neobrutalism.dev/docs/installation)

### 11. 技术架构设计（MV3）
1. 架构分层：
   1. `newtab`（React UI）：展示书签、搜索筛选、预览确认、触发整理。
   2. `background service worker`：统一执行业务命令（分类、去重、写回、回滚）。
   3. `chrome.bookmarks`：书签读写能力。
   4. `chrome.storage.local`：持久配置和错误日志。
   5. `chrome.storage.session`：会话级备份与临时任务数据。
   6. OpenAI API：分类与分组命名。
2. 调用原则：
   1. UI 不直接改书签，所有写操作都走 `background` 消息总线。
   2. `background` 内部串行化写操作，避免并发写入导致结构错乱。
   3. 会话备份先于写回执行，任何失败按策略自动回滚。

### 12. 模块拆分设计
1. `src/background/`
   1. `index.ts`：service worker 入口，注册消息处理器。
   2. `message-router.ts`：消息分发与统一响应格式。
   3. `services/bookmark-service.ts`：书签读取、写回、回滚。
   4. `services/ai-service.ts`：OpenAI 调用与重试控制。
   5. `services/classification-service.ts`：分类、去重、分组命名、预览计划生成。
   6. `services/backup-service.ts`：会话备份读写与淘汰（最多 5 次）。
   7. `utils/url-normalizer.ts`：URL 归一化。
   8. `utils/logger.ts`：错误日志落盘。
2. `src/newtab/`
   1. `pages/Home.tsx`：书签浏览、搜索、筛选。
   2. `pages/Organizer.tsx`：分类预览、确认写回、重跑。
   3. `pages/Settings.tsx`：`API Key/Base URL/Model` 配置。
   4. `components/`：预览树、差异统计、确认弹窗、错误提示。
3. `src/shared/`
   1. `types.ts`：前后端共享类型。
   2. `message-contract.ts`：消息协议与命令常量。
   3. `schemas.ts`：AI 返回结构校验（建议 `zod`）。

### 13. 消息协议设计
1. 请求命令（UI -> background）：
   1. `config.get` / `config.set`
   2. `bookmarks.query`
   3. `organize.preview.generate`
   4. `organize.preview.regenerateByFolder`
   5. `organize.apply`
   6. `organize.rollback`
   7. `bookmark.update`
   8. `bookmark.delete`
2. 统一返回结构：
```ts
type ApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};
```

### 14. 数据模型设计
```ts
type AppConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type BookmarkItem = {
  id: string;
  title: string;
  url: string;
  parentId: string;
  path: string[];
};

type GroupPlan = {
  groupName: string;
  bookmarkIds: string[];
  reason?: string;
};

type OrganizePreview = {
  generatedAt: number;
  totalCount: number;
  uniqueCount: number;
  duplicateCount: number;
  groups: GroupPlan[];
  duplicateIds: string[];
};

type BackupSnapshot = {
  backupId: string;
  createdAt: number;
  tree: chrome.bookmarks.BookmarkTreeNode[];
  inverseOps: OperationLog[];
};

type OperationLog =
  | { type: "create"; id: string }
  | { type: "move"; id: string; fromParentId: string; fromIndex: number }
  | { type: "update"; id: string; oldTitle?: string; oldUrl?: string }
  | { type: "remove"; node: chrome.bookmarks.BookmarkTreeNode; parentId: string; index: number };
```

### 15. 核心流程设计
1. 预览生成（`organize.preview.generate`）：
   1. 读取全部书签树并扁平化 URL 节点。
   2. 执行 URL 归一化并识别重复项。
   3. 去重后数据分批发送至 OpenAI，获取分类与分组命名。
   4. 合并分批结果并生成 `OrganizePreview` 返回 UI。
2. 局部重跑（`organize.preview.regenerateByFolder`）：
   1. 接收目标文件夹 ID。
   2. 仅对该文件夹内书签重新执行分类，其他分组保留。
3. 接受写回（`organize.apply`）：
   1. 读取当前树并写入会话备份（最多保留 5 次）。
   2. 根据预览计划创建/重命名分组文件夹并移动书签。
   3. 删除重复书签。
   4. 任一步失败触发自动回滚并返回错误。
4. 一键回滚（`organize.rollback`）：
   1. 仅可回滚当前会话备份。
   2. 恢复逻辑：优先使用 `inverseOps` 回放；若日志不完整则使用快照重建。
   3. 回滚成功后删除该次备份，防止重复回放。

### 16. URL 归一化与去重算法
1. 归一化步骤（按已确认规则）：
   1. 清理 `utm_*`、`fbclid`、`gclid` 参数。
   2. 去除 hash。
   3. 域名小写。
   4. 去除末尾 `/`。
   5. 将 `http` 和 `https` 统一为同一 canonical key。
2. 去重策略：
   1. 按 canonical key 分组。
   2. 每组保留 1 条主记录（优先级：标题非空 > 路径更短 > 创建顺序更早）。
   3. 其余标记为 `duplicateIds`，在写回阶段删除。

### 17. AI 调用与提示词契约
1. 调用策略：超时 `30s`，失败自动重试 `2` 次，`429` 退避重试。
2. 分批策略：按书签数量分 chunk（建议每批 100~200 条，避免上下文超限）。
3. 输出约束：要求模型仅返回 JSON，不允许额外文本。
4. 最小输出 Schema：
```json
{
  "groups": [
    {
      "groupName": "string",
      "bookmarkIds": ["string"],
      "reason": "string"
    }
  ]
}
```
5. 落地前校验：JSON 解析失败或 schema 不匹配时，视为可重试错误。

### 18. 存储设计
1. `chrome.storage.local`：
   1. `app:config`：`AppConfig`
   2. `app:errorLogs`：最近 N 条错误日志（建议上限 500）
2. `chrome.storage.session`：
   1. `session:preview`：当前预览结果
   2. `session:backups`：会话备份队列（最大 5 条）
   3. `session:lastAppliedBackupId`：最近一次可回滚对象

### 19. Manifest 与权限设计
1. `manifest_version: 3`
2. 必需权限：
   1. `bookmarks`
   2. `storage`
3. 可能使用的权限：
   1. `tabs`（若需要从当前 tab 快速打开管理页）
4. 页面入口：
   1. `chrome_url_overrides` 或 action 打开独立页面（二选一，当前需求采用 action 打开独立 tab）。
5. Host 权限：
   1. 若 `Base URL` 可自定义，需声明可访问对应 API 域名（实现时做最小化限制）。

### 20. 异常处理与日志分级
1. `401`：立即提示 `API Key` 无效或过期，不自动重试。
2. `429`：指数退避重试（如 `1s/2s`）。
3. 网络超时：标记可重试错误，用户可手动重试。
4. 写回失败：自动回滚，若回滚失败则进入“需人工处理”状态并记录完整日志。
5. 日志字段：`time`、`command`、`errorCode`、`message`、`stack`、`context`。

### 21. 测试设计
1. 单元测试：
   1. URL 归一化。
   2. 去重分组与主记录选择。
   3. AI 输出 schema 校验和异常分支。
2. 集成测试：
   1. 预览生成 -> 写回 -> 自动回滚全链路。
   2. 局部重跑仅影响目标文件夹。
3. 手工验收：
   1. 大量书签（1k+）场景可完成分类与写回。
   2. 关键错误（401/429/超时）提示准确。
   3. 当前会话内一键回滚可恢复。

### 22. 开发里程碑
1. M1（基础骨架）：
   1. MV3 工程初始化，`newtab/background/shared` 目录与消息总线。
   2. 设置页与配置存储打通。
2. M2（核心能力）：
   1. 书签读取、URL 归一化、去重预览。
   2. OpenAI 分类与分组命名接入。
3. M3（写回与回滚）：
   1. 写回流程、会话备份、自动回滚与手动回滚。
4. M4（管理页）：
   1. 搜索筛选、编辑删除、分组展示。
5. M5（稳定性）：
   1. 错误处理完善、日志落盘、测试与发布准备。
