# 书签分类体系实施方案

## 1. 目标与边界

本方案的目标不是继续堆叠样本特化规则，而是将当前“AI 直接产出分组路径 + 本地规则兜底”的模式，升级为更稳定的分类系统：

`预清洗 -> 分面抽取 -> taxonomy 映射 -> 路径校验 -> 回归评估`

目标：

- 让分类依据从“当前样本里的目录名”转为“书签内容本身的语义分面”
- 让 AI 先做抽象判断，再映射到稳定 taxonomy
- 降低 [`src/shared/grouping-rules.ts`](/home/nico/Workspace/demos/bookmark_extension/src/shared/grouping-rules.ts) 中样本特化正则的膨胀速度
- 保留当前项目已有优势：固定一级分类、最多三级路径、结果可校验

本阶段不做：

- 全量死链检测
- 自动批量改名
- 语义重复去重
- 一次性推翻现有全部规则

## 2. 目标架构

新的分类流水线建议拆成 5 层：

### 2.1 预清洗

在进入 AI 分类前，先识别并标记以下链接：

- `localhost`
- `127.0.0.1`
- `file://`
- 局域网 IP
- 明显测试环境域名，如 `test.`、`dev.`、`staging.`

目标：

- 防止本地/内网/测试环境链接污染公共主题分类
- 将这类链接单独统计，而不是静默忽略

### 2.2 分面抽取

对每条书签抽取统一字段：

- `primary_topic`
- `resource_type`
- `source_type`
- `usage_intent`
- `scope`

这是新的核心中间层，不再让 AI 直接自由生成分类名。

### 2.3 taxonomy 映射

将分面结果映射到受控词表：

- 一级分类来自固定白名单
- 二三级分类来自稳定子类集合
- 同义词通过归并表统一

### 2.4 路径校验与纠偏

保留当前 [`normalizeGroupPathWithTaxonomy`](/home/nico/Workspace/demos/bookmark_extension/src/shared/grouping-rules.ts:397) 这样的能力，但其职责从“主分类器”降级为“归一化收口器”。

### 2.5 评估与观测

对分类结果建立可回归的评估机制，重点关注：

- 一级分类准确率
- 二级分类准确率
- `其他主题` 占比
- 分类漂移率
- 被错误纳入公共分类的内网/本地链接数

## 3. 阶段拆分

### 阶段 0：分类学建模

目标：

- 先定义理论模型，不急着写逻辑

任务：

- 定义 5 个分面字段的枚举和含义
- 定义哪些维度允许进入目录树，哪些只能做辅助判断
- 设计 taxonomy 命名原则
- 明确 `技术` 与 `学习`、`技术` 与 `工具`、`AI` 与 `技术` 的边界

产出：

- [`documents/taxonomy-design.md`](/home/nico/Workspace/demos/bookmark_extension/documents/taxonomy-design.md)
- 分类判定原则表

验收标准：

- 任意书签都能先用分面解释，再映射到路径
- 同一层级不再混放“主题”和“站点形态”

### 阶段 1：受控词表设计

目标：

- 将目录体系从“隐含在正则里”变成“显式配置”

任务：

- 定义一级分类白名单
- 定义二三级推荐子类白名单
- 定义同义词归并表
- 定义禁用分类名和脏分类名

建议结构：

- `topLevelGroups`
- `secondLevelGroupsByTop`
- `thirdLevelGroupsBySecond`
- `aliases`
- `forbiddenNames`

建议保留的一级分类：

- 技术
- AI
- 工具
- 设计
- 学习
- 资讯
- 工作
- 生活
- 影音
- 其他主题

验收标准：

- taxonomy 可以脱离代码被单独阅读和维护
- 不需要翻正则才能知道系统支持哪些分类

### 阶段 2：Prompt 重构

目标：

- 将“按样本修补”的提示词升级为“先分面，后映射”的通用提示词

任务：

- 重写 [`src/background/services/ai-service.ts`](/home/nico/Workspace/demos/bookmark_extension/src/background/services/ai-service.ts) 中 `buildPromptPayload` 的 `instruction`
- 要求 AI 输出两段结果：
  - `facets`
  - `groupPath`
- 增加明确约束：
  - 目录树只按主题分类
  - `resource_type/source_type/scope` 不能与主题混用
  - 内网、本地、测试环境链接优先标记为排除或归档候选
  - 分类名必须来自受控词表或其同义词映射

建议输出结构：

```json
{
  "groups": [
    {
      "groupPath": ["技术", "前端开发", "JavaScript"],
      "bookmarkIds": ["..."],
      "reason": "可选，调试阶段保留"
    }
  ],
  "facets": [
    {
      "id": "...",
      "primary_topic": "前端开发",
      "resource_type": "文档",
      "source_type": "官方",
      "usage_intent": "查阅",
      "scope": "公开"
    }
  ]
}
```

验收标准：

- 不依赖当前样例目录名也能完成分类
- AI 返回的分类名显著收敛，减少自由发挥

### 阶段 3：代码职责重构

目标：

- 把“提示词负责什么，代码负责什么”彻底切开

提示词负责：

- 分面理解
- 语义分类
- 候选路径判断

代码负责：

- 预清洗
- taxonomy 白名单约束
- 同义词归并
- 禁用名称拦截
- 最大深度控制
- 兜底修正
- 结果一致性校验

重点文件：

- [`src/background/services/ai-service.ts`](/home/nico/Workspace/demos/bookmark_extension/src/background/services/ai-service.ts)
- [`src/shared/grouping-rules.ts`](/home/nico/Workspace/demos/bookmark_extension/src/shared/grouping-rules.ts)
- [`tests/grouping-rules.test.ts`](/home/nico/Workspace/demos/bookmark_extension/tests/grouping-rules.test.ts)

建议新增：

- `src/shared/taxonomy.ts` 或 `src/shared/taxonomy.json`
- `src/shared/facets.ts`
- `tests/taxonomy-mapping.test.ts`

验收标准：

- `grouping-rules.ts` 从“大杂烩规则文件”收敛为“映射与校验器”
- taxonomy 可单独演进，不需要频繁改底层逻辑

### 阶段 4：样本集与评估体系

目标：

- 避免“改一次好一次，换数据又崩”

任务：

- 建立最小评估集，至少覆盖以下样本：
  - 公开技术资料
  - AI 平台与 API
  - 工具站
  - 学习资源
  - 内网/本地/测试链接
- 为每条样本标注期望分面和期望路径
- 建立回归测试

评估指标：

- 一级分类准确率
- 二级分类准确率
- 禁用分类名出现率
- `其他主题` 占比
- 目录漂移率
- 被错误混入公共分类的内网/本地链接数量

验收标准：

- 每次调整 prompt 或 taxonomy 后都能回归验证
- 不再靠肉眼临时判断“这次看起来还行”

### 阶段 5：灰度迁移

目标：

- 不一次性推翻现有行为

策略：

- 第一阶段保留现有本地兜底逻辑
- AI 新输出先走新 taxonomy 映射，再回落到旧规则
- 用样本对比旧方案和新方案结果差异
- 差异过大时优先审查 taxonomy，不要急着补丁式加正则

验收标准：

- 现有功能可持续使用
- 新方案逐步替代旧方案，而不是一次性重写

## 4. 具体设计原则

### 4.1 目录树原则

- 一棵树只承载一个主逻辑，默认是“主题”
- 不把“主题、站点类型、来源、用途、环境”混在同一层

### 4.2 分面原则

- `primary_topic` 决定路径
- `resource_type` 影响二三级细化，但不应反客为主
- `source_type` 更多用于排序、命名、辅助判断
- `scope` 优先决定是否应进入公共整理结果

### 4.3 命名原则

- 分类名短、稳定、可复用
- 优先使用通用名词，不使用样本专属表达
- 不允许同义词并存，比如“社区博客/技术社区/博客社区”只能保留一个稳定名称

### 4.4 纠偏原则

- prompt 允许出错，代码必须收口
- 任何 AI 输出都必须经过：
  - 白名单校验
  - 禁用词校验
  - 最大深度校验
  - 重复层级校验

## 5. 当前项目中的建议落点

第一批优先改动点：

- [`src/background/services/ai-service.ts`](/home/nico/Workspace/demos/bookmark_extension/src/background/services/ai-service.ts)
  - 重写提示词结构
  - 让 AI 输出 facets
  - 减少样本化语言，增强通用约束

- [`src/shared/grouping-rules.ts`](/home/nico/Workspace/demos/bookmark_extension/src/shared/grouping-rules.ts)
  - 将“硬编码分类经验”拆成：
    - taxonomy 定义
    - alias 归并
    - fallback 规则
  - 缩减对当前书签样本强依赖的正则

- [`tests/grouping-rules.test.ts`](/home/nico/Workspace/demos/bookmark_extension/tests/grouping-rules.test.ts)
  - 从“单点例子测试”升级为“分面 + 路径映射 + 脏输入过滤”的回归测试

## 6. 风险与控制

主要风险：

- taxonomy 设计过大，维护成本高
- prompt 太复杂，AI 输出反而不稳定
- facets 抽取字段过多，超出当前模型稳定能力
- 迁移时旧规则与新体系冲突

控制策略：

- 一级固定，二三级先小步演进
- facets 先只上 5 个，不要贪多
- 先保留旧规则作为 fallback
- 每次只改一个变量：taxonomy、prompt、校验器不要同时大改

## 7. 推荐执行顺序

1. 先写 taxonomy 设计文档
2. 再抽出受控词表配置
3. 然后重写 prompt
4. 接着改本地映射与校验逻辑
5. 最后补评估集与回归测试

## 8. 下一步建议

最合理的下一步不是直接大改代码，而是先产出两份落地内容：

1. `src/shared/taxonomy.ts` 的结构草案
2. `src/background/services/ai-service.ts` 的新版 Prompt 草案

其中优先级更高的是 `taxonomy.ts`，因为没有受控词表，Prompt 再漂亮也会继续漂。
