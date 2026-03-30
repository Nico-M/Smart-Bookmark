import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMMANDS } from "@/shared/message-contract";
import type { BookmarkFolder, BookmarkItem } from "@/shared/types";
import { sendRuntimeMessage } from "../api/runtime-client";

const MAX_CATEGORY_DEPTH = 3;
const UNCATEGORIZED_CATEGORY = "未分组";
const ROOT_CATEGORY_LABELS = new Set<string>([
  "favorites bar",
  "bookmarks bar",
  "bookmarks toolbar",
  "other bookmarks",
  "other favorites",
  "mobile bookmarks",
  "favourites bar",
  "书签栏",
  "书签工具栏",
  "收藏夹栏",
  "其他书签",
  "其他收藏夹",
  "移动设备书签"
]);

type CategoryTreeNode = {
  name: string;
  fullPath: string[];
  totalCount: number;
  items: BookmarkItem[];
  children: CategoryTreeNode[];
};

/**
 * 主页：展示书签列表并提供搜索、编辑、删除能力。
 */
export function HomePage() {
  const [keyword, setKeyword] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [items, setItems] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTopCategory, setActiveTopCategory] = useState<string>("");

  const categoryTree = useMemo(() => buildCategoryTree(items), [items]);
  const totalText = useMemo(
    () => `共 ${items.length} 条书签，${categoryTree.length} 个顶级分类`,
    [categoryTree.length, items.length]
  );

  useEffect(() => {
    if (categoryTree.length === 0) {
      if (activeTopCategory) {
        setActiveTopCategory("");
      }
      return;
    }
    const hasActive = categoryTree.some((node) => toCategoryKey(node.fullPath) === activeTopCategory);
    if (!hasActive) {
      setActiveTopCategory(toCategoryKey(categoryTree[0].fullPath));
    }
  }, [activeTopCategory, categoryTree]);

  const loadBookmarks = useCallback(async (nextKeyword: string, nextFolderId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await sendRuntimeMessage(COMMANDS.BOOKMARKS_QUERY, {
        keyword: nextKeyword || undefined,
        folderId: nextFolderId || undefined
      });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取书签失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 读取可筛选的书签目录。
   */
  const loadFolders = useCallback(async () => {
    const data = await sendRuntimeMessage(COMMANDS.BOOKMARKS_FOLDERS, {});
    setFolders(data.folders);
  }, []);

  useEffect(() => {
    void Promise.all([loadBookmarks("", ""), loadFolders()]);
  }, [loadBookmarks, loadFolders]);

  /**
   * 编辑书签标题，当前通过 prompt 快速交互。
   */
  async function onRename(item: BookmarkItem) {
    const title = window.prompt("请输入新的书签标题", item.title)?.trim();
    if (!title || title === item.title) {
      return;
    }
    await sendRuntimeMessage(COMMANDS.BOOKMARK_UPDATE, { id: item.id, title });
    await loadBookmarks(keyword, folderId);
  }

  /**
   * 删除书签并刷新列表。
   */
  async function onDelete(item: BookmarkItem) {
    const confirmed = window.confirm(`确定删除书签「${item.title || item.url}」吗？`);
    if (!confirmed) {
      return;
    }
    await sendRuntimeMessage(COMMANDS.BOOKMARK_DELETE, { id: item.id });
    await loadBookmarks(keyword, folderId);
  }

  /**
   * 渲染单条书签卡片。
   */
  function renderBookmarkItem(item: BookmarkItem) {
    return (
      <li
        key={item.id}
        className="flex flex-col gap-3 overflow-hidden rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow md:flex-row md:items-start md:justify-between"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-base font-heading break-words">{item.title || "(无标题)"}</p>
          <p className="text-sm break-all">{item.url}</p>
          <div className="flex flex-wrap items-start gap-2">
            <Badge variant="neutral">ID: {item.id}</Badge>
            <p className="text-xs break-words">{item.path.join(" / ") || "(根目录)"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="neutral" onClick={() => void onRename(item)}>
            改名
          </Button>
          <Button variant="neutral" className="bg-[#ffc6c6]" onClick={() => void onDelete(item)}>
            删除
          </Button>
        </div>
      </li>
    );
  }

  /**
   * 渲染二级分类 Accordion 项。
   */
  function renderSecondLevelAccordion(node: CategoryTreeNode) {
    return (
      <Accordion key={toCategoryKey(node.fullPath)}>
        <AccordionItem open>
          <AccordionTrigger className="cursor-pointer">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-heading break-words">{node.name}</p>
              <Badge variant="neutral">{node.totalCount} 条</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            {node.items.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs">直属书签</p>
                <ul className="grid gap-3">{node.items.map((item) => renderBookmarkItem(item))}</ul>
              </div>
            ) : null}

            {node.children.length > 0 ? (
              <div className="grid gap-3">
                {node.children.map((thirdLevelNode) => (
                  <section
                    key={toCategoryKey(thirdLevelNode.fullPath)}
                    className="rounded-base border-2 border-border bg-background p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-heading break-words">{thirdLevelNode.name}</p>
                      <Badge variant="neutral">{thirdLevelNode.totalCount} 条</Badge>
                    </div>
                    {thirdLevelNode.items.length > 0 ? (
                      <ul className="mt-2 grid gap-3">
                        {thirdLevelNode.items.map((item) => renderBookmarkItem(item))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  /**
   * 仅渲染当前顶级 Tab 的子内容，不重复展示顶级分类名。
   */
  function renderTopCategoryContent(node: CategoryTreeNode) {
    if (node.children.length > 0) {
      return <div className="space-y-3">{node.children.map((child) => renderSecondLevelAccordion(child))}</div>;
    }
    if (node.items.length > 0) {
      return <ul className="grid gap-3">{node.items.map((item) => renderBookmarkItem(item))}</ul>;
    }
    return <p className="text-sm">当前分类下暂无书签。</p>;
  }

  return (
    <Card className="h-full min-h-0">
      <CardHeader className="border-b-2 border-border">
        <CardTitle className="text-lg">书签列表</CardTitle>
        <CardDescription>{totalText}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="输入关键字搜索标题或 URL"
            className="max-w-md"
          />
          <select
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            className="h-10 rounded-base border-2 border-border bg-secondary-background px-3 text-sm"
          >
            <option value="">全部文件夹</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {[...folder.path, folder.title].join(" / ")}
              </option>
            ))}
          </select>
          <Button onClick={() => void loadBookmarks(keyword, folderId)} disabled={loading}>
            {loading ? "加载中..." : "搜索"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-base border-2 border-border bg-[#ffd3d3] px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="text-sm">当前筛选条件下没有书签。</p>
        ) : (
          <Tabs
            value={activeTopCategory}
            onValueChange={setActiveTopCategory}
            className="flex min-h-0 flex-1 w-full flex-col"
          >
            <TabsList className="h-auto w-full shrink-0 flex-wrap justify-start gap-2 p-2">
              {categoryTree.map((node) => (
                <TabsTrigger
                  key={toCategoryKey(node.fullPath)}
                  value={toCategoryKey(node.fullPath)}
                  className="h-9"
                >
                  {node.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {categoryTree.map((node) => (
              <TabsContent
                key={toCategoryKey(node.fullPath)}
                value={toCategoryKey(node.fullPath)}
                className="min-h-0 flex-1 overflow-y-auto pr-1"
              >
                {renderTopCategoryContent(node)}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

type CategoryTreeNodeDraft = {
  name: string;
  fullPath: string[];
  totalCount: number;
  items: BookmarkItem[];
  children: Map<string, CategoryTreeNodeDraft>;
};

/**
 * 根据书签路径构建分类树，最多展示 3 级分类。
 */
function buildCategoryTree(items: BookmarkItem[]): CategoryTreeNode[] {
  const root = new Map<string, CategoryTreeNodeDraft>();

  for (const item of items) {
    const categoryPath = normalizeCategoryPath(item.path);
    let cursor = root;
    let currentPath: string[] = [];
    let leaf: CategoryTreeNodeDraft | null = null;

    for (const segment of categoryPath) {
      currentPath = [...currentPath, segment];
      const existing = cursor.get(segment);
      if (existing) {
        existing.totalCount += 1;
        leaf = existing;
        cursor = existing.children;
        continue;
      }

      const created: CategoryTreeNodeDraft = {
        name: segment,
        fullPath: currentPath,
        totalCount: 1,
        items: [],
        children: new Map<string, CategoryTreeNodeDraft>()
      };
      cursor.set(segment, created);
      leaf = created;
      cursor = created.children;
    }

    if (leaf) {
      leaf.items.push(item);
    }
  }

  return finalizeCategoryNodes(root);
}

/**
 * 标准化分类路径，超出 3 级时将尾部折叠到第 3 级。
 */
function normalizeCategoryPath(path: string[]): string[] {
  const normalized = path
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const withoutRoot = removeRootCategoryPrefix(normalized);
  if (withoutRoot.length === 0) {
    return [UNCATEGORIZED_CATEGORY];
  }
  if (withoutRoot.length <= MAX_CATEGORY_DEPTH) {
    return withoutRoot;
  }
  return [
    ...withoutRoot.slice(0, MAX_CATEGORY_DEPTH - 1),
    withoutRoot.slice(MAX_CATEGORY_DEPTH - 1).join(" / ")
  ];
}

/**
 * 去掉路径前缀中的浏览器根目录名称（如 Favorites bar）。
 */
function removeRootCategoryPrefix(path: string[]): string[] {
  let index = 0;
  while (index < path.length) {
    const key = path[index].trim().toLowerCase();
    if (!ROOT_CATEGORY_LABELS.has(key)) {
      break;
    }
    index += 1;
  }
  return path.slice(index);
}

/**
 * 将草稿树节点转为可渲染结构并排序。
 */
function finalizeCategoryNodes(map: Map<string, CategoryTreeNodeDraft>): CategoryTreeNode[] {
  return [...map.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    .map((node) => ({
      name: node.name,
      fullPath: node.fullPath,
      totalCount: node.totalCount,
      items: [...node.items].sort((a, b) =>
        (a.title || a.url).localeCompare(b.title || b.url, "zh-CN")
      ),
      children: finalizeCategoryNodes(node.children)
    }));
}

/**
 * 将分类路径编码为稳定 key。
 */
function toCategoryKey(path: string[]): string {
  return path.join("\u0000");
}
