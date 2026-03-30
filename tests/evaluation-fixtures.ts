import type { BookmarkItem, ExcludeReason } from "../src/shared/types.js";

/**
 * 统一构造测试书签，避免各测试文件重复维护默认字段。
 */
export function createBookmark(overrides: Partial<BookmarkItem>): BookmarkItem {
  return {
    id: "1",
    title: "",
    url: "https://example.com",
    parentId: "0",
    path: [],
    ...overrides
  };
}

export type NormalizationBaselineCase = {
  name: string;
  inputGroupPath: string[];
  bookmark: BookmarkItem;
  expectedGroupPath: string[];
};

export type InferenceBaselineCase = {
  name: string;
  bookmark: BookmarkItem;
  expectedGroupPath: string[];
};

export type PreprocessBaselineCase = {
  name: string;
  bookmark: BookmarkItem;
  expectedReason?: ExcludeReason;
  expectedSuggestedGroupPath?: string[];
};

/**
 * 路径归一化基线：覆盖历史别名、漂移名称和跨一级类回流等高频场景。
 */
export const NORMALIZATION_BASELINE_CASES: NormalizationBaselineCase[] = [
  {
    name: "历史技术社区会归并到技术下的社区博客",
    inputGroupPath: ["技术社区"],
    bookmark: createBookmark({
      title: "AlloyTeam 团队博客",
      url: "https://www.alloyteam.com/"
    }),
    expectedGroupPath: ["技术", "社区博客"]
  },
  {
    name: "其他主题中的个人工具会回流到工具目录",
    inputGroupPath: ["其他主题", "个人工具", "效率工具"],
    bookmark: createBookmark({
      title: "Excalidraw",
      url: "https://excalidraw.com/"
    }),
    expectedGroupPath: ["工具", "效率工具"]
  },
  {
    name: "误归入 AI 的普通编程教程会回流到技术基础与语言",
    inputGroupPath: ["AI", "编程与平台"],
    bookmark: createBookmark({
      title: "Python - 100天从新手到大师",
      url: "https://github.com/jackfrued/Python-100-Days"
    }),
    expectedGroupPath: ["技术", "基础与语言"]
  },
  {
    name: "开发工具的历史三级名称会归并到版本控制",
    inputGroupPath: ["技术", "开发工具", "git教程"],
    bookmark: createBookmark({
      title: "Git - Book",
      url: "https://www.git-scm.com/book/zh/v2"
    }),
    expectedGroupPath: ["技术", "开发工具", "版本控制"]
  },
  {
    name: "AI 平台的泛化控制台名称会归并到 API 服务",
    inputGroupPath: ["AI", "编程与平台", "控制台"],
    bookmark: createBookmark({
      title: "OpenAI API Platform",
      url: "https://platform.openai.com/"
    }),
    expectedGroupPath: ["AI", "编程与平台", "API 服务"]
  },
  {
    name: "公司业务类历史路径会回流到工作内部系统",
    inputGroupPath: ["其他主题", "公司业务", "内部系统"],
    bookmark: createBookmark({
      title: "System Dashboard - Wtoip JIRA",
      url: "http://192.168.30.27:8080/secure/Dashboard.jspa"
    }),
    expectedGroupPath: ["工作", "内部系统"]
  }
];

/**
 * 兜底分类基线：验证不同用户书签在没有 AI 路径时也能落到稳定主类。
 */
export const INFERENCE_BASELINE_CASES: InferenceBaselineCase[] = [
  {
    name: "React 官方文档会归入技术前端开发",
    bookmark: createBookmark({
      title: "React 官方文档",
      url: "https://react.dev/reference/react"
    }),
    expectedGroupPath: ["技术", "前端开发"]
  },
  {
    name: "系统课程会归入学习课程教程",
    bookmark: createBookmark({
      title: "Coursera Machine Learning Course",
      url: "https://www.coursera.org/learn/machine-learning"
    }),
    expectedGroupPath: ["学习", "课程教程"]
  },
  {
    name: "OpenAI 平台会归入 AI 编程与平台",
    bookmark: createBookmark({
      title: "OpenAI API Platform",
      url: "https://platform.openai.com/"
    }),
    expectedGroupPath: ["AI", "编程与平台"]
  },
  {
    name: "软件资源站会归入工具软件资源",
    bookmark: createBookmark({
      title: "异次元软件世界 - 软件改变生活",
      url: "https://www.iplaysoft.com/"
    }),
    expectedGroupPath: ["工具", "软件资源"]
  }
];

/**
 * 预清洗基线：验证排除逻辑既能命中脏输入，也不会误伤公开站点。
 */
export const PREPROCESS_BASELINE_CASES: PreprocessBaselineCase[] = [
  {
    name: "localhost 页面会被识别为本地服务",
    bookmark: createBookmark({
      id: "local-service",
      title: "本地页面",
      url: "http://localhost:8869/"
    }),
    expectedReason: "本地服务",
    expectedSuggestedGroupPath: ["工作", "内部系统", "本地服务"]
  },
  {
    name: "内网地址会被识别为内网地址",
    bookmark: createBookmark({
      id: "intranet",
      title: "JIRA Dashboard",
      url: "http://192.168.1.20:8080/"
    }),
    expectedReason: "内网地址",
    expectedSuggestedGroupPath: ["工作", "内部系统", "内网地址"]
  },
  {
    name: "file 协议会被识别为本地文件",
    bookmark: createBookmark({
      id: "local-file",
      title: "本地 HTML",
      url: "file:///Users/nico/demo/index.html"
    }),
    expectedReason: "本地文件",
    expectedSuggestedGroupPath: ["工作", "内部系统", "本地文件"]
  },
  {
    name: "测试环境子域名会被识别为测试环境",
    bookmark: createBookmark({
      id: "test-env",
      title: "测试站点",
      url: "https://staging.demo.com/dashboard"
    }),
    expectedReason: "测试环境",
    expectedSuggestedGroupPath: ["工作", "项目平台", "测试环境"]
  },
  {
    name: "公开 .dev 域名不会被误判为测试环境",
    bookmark: createBookmark({
      id: "public-dev-domain",
      title: "React",
      url: "https://react.dev/learn"
    })
  },
  {
    name: "公开 dev.to 域名不会被误判为测试环境",
    bookmark: createBookmark({
      id: "devto",
      title: "dev.to",
      url: "https://dev.to/"
    })
  }
];
