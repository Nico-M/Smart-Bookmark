/**
 * 分类匹配规则：使用正则表达式识别输入文本，并归并到稳定分类名。
 */
export type GroupMatchRule = {
  pattern: RegExp;
  name: string;
};

/**
 * 三级分类规则：按已经归一化的二级分类继续细分，保持命名稳定。
 */
export type ThirdLevelRuleMap = Record<string, GroupMatchRule[]>;

/**
 * 分面白名单：用于提示词约束 AI 输出的辅助分类字段。
 */
export type FacetOptions = {
  resourceTypes: string[];
  sourceTypes: string[];
  usageIntents: string[];
  scopes: string[];
};

export const FALLBACK_TOP_LEVEL_NAME = "其他主题";
export const TOP_LEVEL_GROUPS = [
  "技术",
  "AI",
  "工具",
  "设计",
  "学习",
  "资讯",
  "工作",
  "生活",
  "影音",
  FALLBACK_TOP_LEVEL_NAME
] as const;

export type TopLevelGroupName = (typeof TOP_LEVEL_GROUPS)[number];

/**
 * 禁用兜底名称：AI 和本地归一化都应使用同一套口径，避免“未分类”等脏名称渗透进结果。
 */
export const FORBIDDEN_GROUP_NAME_PATTERNS = [
  /未分类/,
  /未分组/,
  /待分类/,
  /^uncategorized$/i,
  /^unclassified$/i,
  /^ungrouped$/i,
  /^unknown$/i,
  /^n\/a$/i,
  /^none$/i
];

/**
 * 禁用名称示例：供 Prompt 和调试输出直接复用，避免把正则细节暴露给模型。
 */
export const FORBIDDEN_GROUP_NAMES = [
  "未分类",
  "未分组",
  "待分类",
  "uncategorized",
  "unclassified",
  "ungrouped",
  "unknown",
  "n/a",
  "none"
];

/**
 * 一级分类别名归并规则：用于把历史路径和 AI 漂移名称统一收口到主 taxonomy。
 */
export const TOP_LEVEL_ALIAS_RULES: GroupMatchRule[] = [
  {
    pattern:
      /(技术开发|技术社区|技术资源|技术博客|技术资讯|核心技术|前端开发|前端框架|编程语言|博客系统|后端开发|语言与规范|react生态|vue与node|移动与小程序|开发工具)/i,
    name: "技术"
  },
  {
    pattern:
      /(人工智能|aigc|ai与python|ai 与 数字化|ai编程与api|ai创作与提示词|模型|llm|agent|mcp|prompt|提示词)/i,
    name: "AI"
  },
  {
    pattern:
      /(个人工具|效率工具|软件工具|资源下载|资源搜索|网络工具|代理与增强|搜索镜像|在线工具|软件资源与系统工具|实用工具)/i,
    name: "工具"
  },
  {
    pattern: /(设计素材|设计与ui|视觉资源|图标与图片|可视化|ui|设计)/i,
    name: "设计"
  },
  {
    pattern:
      /(学习教育|综合学习|编程与技术基础|知识共享|电子书|在线课程|语言与综合技能|学习成长)/i,
    name: "学习"
  },
  {
    pattern: /(综合资讯|科技媒体|资讯与社区|技术资讯|新闻|媒体|资讯阅读|资讯)/i,
    name: "资讯"
  },
  {
    pattern: /(公司业务|内部系统|办公门户|项目平台|工作台|控制台|仪表盘|dashboard|办公)/i,
    name: "工作"
  },
  {
    pattern: /(购物社交|生活兴趣|购物|社交|消费|生活)/i,
    name: "生活"
  },
  {
    pattern: /(影视娱乐|在线影视|音乐与兴趣|视频影视|音乐兴趣|视频|影视|娱乐)/i,
    name: "影音"
  }
];

/**
 * 一级分类语义推断规则：仅在缺少稳定路径时，按标题、URL、原始路径内容做兜底推断。
 */
export const TOP_LEVEL_INFER_RULES: GroupMatchRule[] = [
  {
    pattern:
      /(github|gitlab|stack|docs|developer|前端|后端|编程|开发|代码|技术|react|vue|angular|javascript|typescript|node|webpack|vite|css|html)/i,
    name: "技术"
  },
  {
    pattern:
      /(aigc|artificial intelligence|agent|mcp|llm|gpt|claude|gemini|deepseek|ollama|prompt|提示词|midjourney|stable diffusion|模型|ai )/i,
    name: "AI"
  },
  {
    pattern:
      /(tool|util|convert|generator|下载|软件|系统|proxy|clash|hosts|网盘|磁力|工具|效率)/i,
    name: "工具"
  },
  {
    pattern: /(design|ui|icon|illustration|素材|设计|图标|图片|视觉|配色|可视化)/i,
    name: "设计"
  },
  {
    pattern: /(learn|course|edu|study|教程|课程|学习|教育|book|ebook|guide)/i,
    name: "学习"
  },
  {
    pattern: /(news|资讯|新闻|article|blog|媒体|日报|快讯)/i,
    name: "资讯"
  },
  {
    pattern:
      /(oa|workspace|console|platform|dashboard|jenkins|yapi|devops|内部|办公|项目|工作台|仪表盘)/i,
    name: "工作"
  },
  {
    pattern: /(shop|mall|amazon|taobao|jd|购物|电商|社交|社区|论坛|消费)/i,
    name: "生活"
  },
  {
    pattern: /(youtube|bilibili|video|music|movie|netflix|影视|视频|音乐|娱乐|游戏)/i,
    name: "影音"
  }
];

/**
 * 二级分类语义规则：按一级分类限定子类范围，避免不同主题互相污染。
 */
export const SECOND_LEVEL_RULES: Record<TopLevelGroupName, GroupMatchRule[]> = {
  技术: [
    {
      pattern:
        /(前端|react|vue|angular|css|html|javascript|typescript|rxjs|web|浏览器|小程序|uniapp|ionic)/i,
      name: "前端开发"
    },
    {
      pattern: /(后端|server|java|spring|api|golang|rust|nodejs|数据库|sql|mysql|redis)/i,
      name: "后端开发"
    },
    {
      pattern: /(编程语言|基础与语言|语言|编程|基础|规范|算法|python|go|rust|swift)/i,
      name: "基础与语言"
    },
    {
      pattern: /(工具|debug|调试|构建|工程化|代理|mock|sandbox|git|npm|webpack|vite|ci|cd|devops)/i,
      name: "开发工具"
    },
    {
      pattern:
        /(社区与博客|社区博客|社区|博客|专栏|forum|community|segmentfault|掘金|cnblogs|alloyteam|aotu|fex)/i,
      name: "社区博客"
    },
    {
      pattern: /(资源导航|文档资源|文档|手册|docs|wiki|guide|导航|资源|cheatsheet|参考|教程集合)/i,
      name: "文档资源"
    }
  ],
  AI: [
    {
      pattern:
        /(编程与平台|工具|平台|编程|api|agent|mcp|sdk|token|console|模型|llm|gpt|claude|gemini|deepseek|ollama|code|vibe coding)/i,
      name: "编程与平台"
    },
    {
      pattern:
        /(创作与提示词|提示词|prompt|midjourney|text2img|image|图片|music|音乐|创作|anime|draw|ui|design|图库|素材|风格)/i,
      name: "创作与提示词"
    },
    {
      pattern: /(教程|课程|学习|python|入门|lesson|guide)/i,
      name: "学习资源"
    },
    {
      pattern: /(论文|research|资讯|新闻|paper)/i,
      name: "资讯研究"
    }
  ],
  工具: [
    {
      pattern: /(效率|whiteboard|resume|简历|excalidraw|airdroid|效率工具|个人工具)/i,
      name: "效率工具"
    },
    {
      pattern: /(资源搜索|搜索镜像|搜索|网盘搜索|导航搜索)/i,
      name: "资源搜索"
    },
    {
      pattern: /(资源下载|下载站|bt|torrent|磁力|解析下载|下载器|下载)/i,
      name: "资源下载"
    },
    {
      pattern: /(软件资源|软件下载|mac|windows|app|ipa|store|软件|软件站|应用分享)/i,
      name: "软件资源"
    },
    {
      pattern: /(系统与网络|网络工具|代理与增强|proxy|clash|hosts|dns|network|ip verify|geo)/i,
      name: "系统与网络"
    },
    {
      pattern: /(在线工具|在线|json|convert|generator|markdown|tool|util|占位图片|format)/i,
      name: "在线工具"
    }
  ],
  设计: [
    { pattern: /(图标|icon|图片|image|插画|素材|stock)/i, name: "图标素材" },
    { pattern: /(可视化|chart|echarts|dashboard|图表)/i, name: "可视化" },
    { pattern: /(ui|设计|组件|配色|灵感)/i, name: "UI设计" }
  ],
  学习: [
    { pattern: /(课程|教程|course|study|guide|learn|lesson|specialization|camp|训练营)/i, name: "课程教程" },
    { pattern: /(book|ebook|电子书|文档|资料)/i, name: "资料文档" },
    { pattern: /(英语|词典|语言)/i, name: "语言技能" }
  ],
  资讯: [
    { pattern: /(技术|开发|程序员|前端|后端)/i, name: "技术资讯" },
    { pattern: /(科技|数码|行业|综合)/i, name: "综合资讯" }
  ],
  工作: [
    { pattern: /(公司业务|内部|oa|门户|workspace|console|系统)/i, name: "内部系统" },
    { pattern: /(项目|平台|dashboard|devops|jenkins|yapi)/i, name: "项目平台" }
  ],
  生活: [
    { pattern: /(购物|电商|消费)/i, name: "购物消费" },
    { pattern: /(社交|社区|论坛)/i, name: "社交社区" }
  ],
  影音: [
    {
      pattern: /(在线影视|影视导航|视频影视|视频|影视|movie|tv|anime|bilibili|youtube|影院|剧)/i,
      name: "在线影视"
    },
    { pattern: /(音乐与兴趣|音乐兴趣|音乐|music|radio|吉他|listen|live)/i, name: "音乐兴趣" }
  ],
  其他主题: []
};

/**
 * 三级分类语义规则：只在热点二级类下做稳定细分，避免 taxonomy 一开始就过度膨胀。
 */
export const THIRD_LEVEL_RULES: ThirdLevelRuleMap = {
  前端开发: [
    { pattern: /(javascript|ecmascript|lodash|jstips)/i, name: "JavaScript" },
    { pattern: /(typescript|\bts\b)/i, name: "TypeScript" },
    { pattern: /(css|flex|grid|布局|动画|样式|sass|less|bfc)/i, name: "CSS与布局" },
    { pattern: /(浏览器|跨域|http|network|websocket|cookie|缓存)/i, name: "浏览器与网络" },
    { pattern: /(performance|性能|优化|渲染|首屏|h5-performance)/i, name: "性能优化" },
    { pattern: /(移动端|mobile|h5|flexible|适配)/i, name: "移动端" },
    { pattern: /(react|redux|saga)/i, name: "React" },
    { pattern: /(vue|nuxt|vux|vuesax)/i, name: "Vue" },
    { pattern: /(angular|ngrx|ionic)/i, name: "Angular" },
    { pattern: /(小程序|uniapp|uni-app|taro|跨端|weapp)/i, name: "小程序与跨端" }
  ],
  开发工具: [
    { pattern: /(git|github|gitlab|svn|sourcetree|版本控制|workflow)/i, name: "版本控制" },
    {
      pattern: /(codepen|codesandbox|stackblitz|plunker|jsfiddle|jsrun|web maker|在线编辑器)/i,
      name: "在线编辑器"
    },
    { pattern: /(fiddler|charles|抓包|debug|inspect|调试)/i, name: "调试抓包" },
    { pattern: /(webpack|vite|babel|编译|构建)/i, name: "构建与编译" },
    { pattern: /(npm|verdaccio|registry|包管理|cdn)/i, name: "包管理与仓库" },
    { pattern: /(mock|easy-mock|proxy|代理)/i, name: "Mock与代理" }
  ],
  社区博客: [
    { pattern: /(alloyteam|aotu|fex|isux|team|fed)/i, name: "团队博客" },
    { pattern: /(blog|博客园|简书|csdn|issues)/i, name: "个人博客" },
    { pattern: /(segmentfault|掘金|community|forum|社区)/i, name: "技术社区" }
  ],
  文档资源: [
    { pattern: /(official|docs|documentation|手册|guide|api)/i, name: "官方文档" },
    { pattern: /(中文|china|镜像|翻译)/i, name: "中文镜像" },
    { pattern: /(reference|cheatsheet|参考)/i, name: "参考手册" }
  ],
  编程与平台: [
    { pattern: /(api|token|key|billing|console|gateway|中转|openrouter|openai)/i, name: "API 服务" },
    { pattern: /(model|模型|llm|gpt|claude|gemini|deepseek|platform)/i, name: "模型平台" },
    { pattern: /(agent|mcp|workflow|automation)/i, name: "Agent与MCP" },
    { pattern: /(sdk|framework|langchain|llamaindex|ai sdk)/i, name: "SDK与框架" },
    { pattern: /(ollama|lm studio|local|本地模型)/i, name: "本地模型" }
  ],
  创作与提示词: [
    { pattern: /(prompt|提示词)/i, name: "提示词" },
    { pattern: /(midjourney|draw|image|图片|文生图|图生图)/i, name: "绘图创作" },
    { pattern: /(music|audio|video|音频|视频)/i, name: "音频与视频" },
    { pattern: /(ui|design|界面|设计生成)/i, name: "UI与设计生成" }
  ],
  在线工具: [
    { pattern: /(json|format|formatter)/i, name: "JSON与格式化" },
    { pattern: /(image|图片|占位图片|压缩)/i, name: "图片处理" },
    { pattern: /(markdown)/i, name: "Markdown工具" },
    { pattern: /(carbon|代码展示|snippet)/i, name: "代码展示" }
  ],
  系统与网络: [
    { pattern: /(proxy|clash|hosts|增强)/i, name: "代理与增强" },
    { pattern: /(dns|network|ip verify|geo|网络诊断)/i, name: "DNS与网络诊断" },
    { pattern: /(airdroid|remote|远程)/i, name: "远程访问" }
  ],
  内部系统: [
    { pattern: /(\boa\b|portal|ehr|门户)/i, name: "OA与门户" },
    { pattern: /(confluence|wiki|文档)/i, name: "文档协作" }
  ],
  项目平台: [
    { pattern: /(jenkins|ci|cd)/i, name: "CI与CD" },
    { pattern: /(jira|gitlab|yapi|dashboard|项目)/i, name: "项目管理" }
  ]
};

/**
 * 分面枚举：先用少量稳定选项约束模型，后续可按评估结果逐步扩展。
 */
export const FACET_OPTIONS: FacetOptions = {
  resourceTypes: ["文档", "教程", "博客", "社区", "工具", "视频", "API 服务", "资讯", "项目平台"],
  sourceTypes: ["官方", "社区", "个人", "企业", "公司内部", "本地"],
  usageIntents: ["查阅", "学习", "工作", "创作", "娱乐", "购物"],
  scopes: ["公开", "内网", "本地", "测试环境"]
};

/**
 * 提取规则中的稳定分类名，构建供 Prompt 使用的受控词表视图。
 */
function collectRuleNames(rules: GroupMatchRule[]): string[] {
  return [...new Set(rules.map((rule) => rule.name))];
}

/**
 * 二级分类白名单视图：用于给 AI 提供明确的受控词表，而不是暴露底层正则。
 */
export const SECOND_LEVEL_GROUP_OPTIONS: Record<TopLevelGroupName, string[]> = Object.fromEntries(
  TOP_LEVEL_GROUPS.map((groupName) => [groupName, collectRuleNames(SECOND_LEVEL_RULES[groupName])])
) as Record<TopLevelGroupName, string[]>;

/**
 * 三级分类白名单视图：仅为已有热点二级类提供稳定可选项。
 */
export const THIRD_LEVEL_GROUP_OPTIONS: Record<string, string[]> = Object.fromEntries(
  Object.entries(THIRD_LEVEL_RULES).map(([groupName, rules]) => [groupName, collectRuleNames(rules)])
);

/**
 * 判断一级分类名是否属于固定白名单，便于归一化逻辑复用。
 */
export function isTopLevelGroupName(name: string): name is TopLevelGroupName {
  return TOP_LEVEL_GROUPS.includes(name as TopLevelGroupName);
}
