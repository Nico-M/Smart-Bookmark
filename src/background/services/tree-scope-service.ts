import type { BookmarkItem } from "@/shared/types";

/**
 * 获取指定文件夹及其子层级下的全部书签。
 */
export async function getBookmarksFromFolder(folderId: string): Promise<BookmarkItem[]> {
  const subtree = await chrome.bookmarks.getSubTree(folderId);
  const root = subtree[0];
  if (!root?.children?.length) {
    return [];
  }

  return flattenFromNode(root, []);
}

/**
 * 从给定节点向下扁平化 URL 书签。
 */
function flattenFromNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  path: string[]
): BookmarkItem[] {
  const items: BookmarkItem[] = [];
  const nextPath = node.title ? [...path, node.title] : path;

  if (node.url) {
    items.push({
      id: node.id,
      title: node.title,
      url: node.url,
      parentId: node.parentId ?? "",
      path
    });
    return items;
  }

  for (const child of node.children ?? []) {
    items.push(...flattenFromNode(child, nextPath));
  }

  return items;
}
