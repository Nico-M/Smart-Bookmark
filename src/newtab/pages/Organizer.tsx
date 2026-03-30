import { useEffect, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { COMMANDS } from "@/shared/message-contract";
import type { OrganizePreview } from "@/shared/types";
import { sendRuntimeMessage } from "../api/runtime-client";

type LoadingAction =
  | "refresh-config"
  | "generate-preview"
  | "regenerate-preview"
  | "apply-preview"
  | "rollback";

const MAX_GROUP_DEPTH = 3;

/**
 * 整理页：负责生成预览、按文件夹重跑、应用与回滚入口。
 */
export function OrganizerPage() {
  const [folderId, setFolderId] = useState("");
  const [preview, setPreview] = useState<OrganizePreview | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loadingAction, setLoadingAction] = useState<LoadingAction | null>(null);
  const [loadingText, setLoadingText] = useState<string>("");
  const [aiReady, setAiReady] = useState(false);
  const loading = loadingAction !== null;
  const previewLoading =
    loadingAction === "generate-preview" || loadingAction === "regenerate-preview";

  useEffect(() => {
    void refreshAiConfigState(false);
  }, []);

  /**
   * 刷新 AI 配置状态，用于控制按钮可用性。
   */
  async function refreshAiConfigState(withLoading = true) {
    if (withLoading) {
      startLoading("refresh-config", "正在检查配置...");
    }
    try {
      const data = await sendRuntimeMessage(COMMANDS.CONFIG_GET, {});
      const config = data.config;
      const ready = Boolean(
        config?.apiKey.trim() && config.baseUrl.trim() && config.model.trim()
      );
      setAiReady(ready);
      if (!ready) {
        setStatus("请先到“设置”页配置 API Key、Base URL、Model。");
      }
    } catch (error) {
      setAiReady(false);
      setStatus(error instanceof Error ? error.message : "读取配置失败。");
    } finally {
      if (withLoading) {
        stopLoading();
      }
    }
  }

  /**
   * 生成全量预览。
   */
  async function onGeneratePreview() {
    if (!aiReady) {
      setStatus("请先配置 AI 参数。");
      return;
    }
    startLoading("generate-preview", "正在请求 AI 分类...");
    setStatus("");
    try {
      const data = await sendRuntimeMessage(COMMANDS.ORGANIZE_PREVIEW_GENERATE, {});
      updateLoadingText("正在生成预览...");
      setPreview(data.preview);
      setStatus(`预览已生成，来源：${data.preview.source}`);
      await waitForUiPaint();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "生成预览失败。");
    } finally {
      stopLoading();
    }
  }

  /**
   * 按文件夹 ID 重跑预览。
   */
  async function onRegenerateByFolder() {
    if (!aiReady) {
      setStatus("请先配置 AI 参数。");
      return;
    }
    if (!folderId.trim()) {
      setStatus("请先输入文件夹 ID。");
      return;
    }
    startLoading("regenerate-preview", "正在请求重跑分类...");
    setStatus("");
    try {
      const data = await sendRuntimeMessage(COMMANDS.ORGANIZE_PREVIEW_REGENERATE_BY_FOLDER, {
        folderId: folderId.trim()
      });
      updateLoadingText("正在生成预览...");
      setPreview(data.preview);
      setStatus("已按文件夹重跑预览。");
      await waitForUiPaint();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "重跑失败。");
    } finally {
      stopLoading();
    }
  }

  /**
   * 接受预览并执行真实写回。
   */
  async function onApply() {
    if (!aiReady) {
      setStatus("请先配置 AI 参数。");
      return;
    }
    if (!preview) {
      setStatus("请先生成预览。");
      return;
    }
    const confirmed = window.confirm(
      "确认将预览结果写回到浏览器书签吗？系统会先创建备份。"
    );
    if (!confirmed) {
      return;
    }
    startLoading("apply-preview", "正在写回书签...");
    setStatus("");
    try {
      const data = await sendRuntimeMessage(COMMANDS.ORGANIZE_APPLY, { preview });
      updateLoadingText("正在刷新视图...");
      setStatus(
        data.note ??
          `写回完成。备份 ID: ${data.backupId ?? "-"}，移动 ${data.movedCount}，删除重复 ${data.deletedDuplicateCount}`
      );
      await waitForUiPaint();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "写回失败。");
    } finally {
      stopLoading();
    }
  }

  /**
   * 回滚最近一次应用。
   */
  async function onRollback() {
    const confirmed = window.confirm("确认执行回滚吗？该操作会恢复到最近一次会话备份。");
    if (!confirmed) {
      return;
    }
    startLoading("rollback", "正在回滚书签...");
    setStatus("");
    try {
      const data = await sendRuntimeMessage(COMMANDS.ORGANIZE_ROLLBACK, {});
      updateLoadingText("正在恢复视图...");
      setStatus(data.note ?? (data.rolledBack ? "回滚成功。" : "回滚失败。"));
      await waitForUiPaint();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "回滚失败。");
    } finally {
      stopLoading();
    }
  }

  /**
   * 修改预览中的分组路径，供用户在写回前人工调整。
   */
  function updateGroupPath(index: number, rawPath: string) {
    setPreview((prev) => {
      if (!prev) {
        return prev;
      }
      const groups = [...prev.groups];
      groups[index] = { ...groups[index], groupPath: parseGroupPathInput(rawPath, index) };
      return { ...prev, groups };
    });
  }

  /**
   * 将输入框文本解析为分组路径，限制最多 3 级。
   */
  function parseGroupPathInput(rawPath: string, index: number): string[] {
    const normalized = rawPath
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (normalized.length === 0) {
      return [`分组_${index + 1}`];
    }
    if (normalized.length <= MAX_GROUP_DEPTH) {
      return normalized;
    }
    return [
      ...normalized.slice(0, MAX_GROUP_DEPTH - 1),
      normalized.slice(MAX_GROUP_DEPTH - 1).join(" / ")
    ];
  }

  /**
   * 将分组路径格式化为输入框文本。
   */
  function formatGroupPath(path: string[]): string {
    return path.join(" / ");
  }

  /**
   * 开始加载并记录当前动作。
   */
  function startLoading(action: LoadingAction, text: string) {
    setLoadingAction(action);
    setLoadingText(text);
  }

  /**
   * 更新 loading 阶段文案。
   */
  function updateLoadingText(text: string) {
    setLoadingText(text);
  }

  /**
   * 结束 loading 状态。
   */
  function stopLoading() {
    setLoadingAction(null);
    setLoadingText("");
  }

  /**
   * 等待 UI 至少完成一次下一帧绘制，覆盖“拿到结果后仍在渲染”的空档期。
   */
  async function waitForUiPaint() {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  return (
    <Card>
      <CardHeader className="border-b-2 border-border">
        <CardTitle className="text-lg">整理工作台</CardTitle>
        <CardDescription>预览 - 确认 - 写回 - 回滚</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void onGeneratePreview()} disabled={loading || !aiReady}>
            {loadingAction === "generate-preview" ? "生成中..." : "生成全量预览"}
          </Button>
          <Input
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            placeholder="输入文件夹 ID 后局部重跑"
            className="max-w-md"
          />
          <Button
            variant="neutral"
            onClick={() => void onRegenerateByFolder()}
            disabled={loading || !aiReady}
          >
            {loadingAction === "regenerate-preview" ? "重跑中..." : "文件夹重跑"}
          </Button>
          <Button
            variant="neutral"
            onClick={() => void refreshAiConfigState(true)}
            disabled={loading}
          >
            {loadingAction === "refresh-config" ? "检查中..." : "刷新配置状态"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void onApply()} disabled={loading || !preview || !aiReady}>
            {loadingAction === "apply-preview" ? "写回中..." : "接受并写回"}
          </Button>
          <Button variant="neutral" onClick={() => void onRollback()} disabled={loading}>
            {loadingAction === "rollback" ? "回滚中..." : "一键回滚"}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-base border-2 border-border bg-main/20 px-3 py-2 text-sm">
            <span className="size-4 animate-spin rounded-full border-2 border-border border-t-transparent" />
            <span>{loadingText || "处理中..."}</span>
          </div>
        ) : null}

        {status ? (
          <div className="rounded-base border-2 border-border bg-secondary-background px-3 py-2 text-sm">
            {status}
          </div>
        ) : null}

        {previewLoading ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-20" />
            </div>
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow"
                >
                  <Skeleton className="mb-2 h-10 w-full max-w-xs" />
                  <Skeleton className="mb-2 h-4 w-28" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        ) : preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge>总数：{preview.totalCount}</Badge>
              <Badge variant="neutral">唯一：{preview.uniqueCount}</Badge>
              <Badge variant="neutral">重复：{preview.duplicateCount}</Badge>
              <Badge variant="neutral">预计移动：{preview.estimatedMoveCount}</Badge>
              <Badge variant="neutral">分组：{preview.groups.length}</Badge>
            </div>
            <ul className="grid gap-3">
              {preview.groups.map((group, index) => (
                <li
                  key={`${group.groupPath.join("/")}_${index}`}
                  className="rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow"
                >
                  <Input
                    value={formatGroupPath(group.groupPath)}
                    onChange={(event) => updateGroupPath(index, event.target.value)}
                    className="max-w-xl"
                  />
                  <p className="mt-1 text-xs">分类路径最多 3 级，使用 / 分隔</p>
                  <p className="mt-1 text-sm">书签数：{group.bookmarkIds.length}</p>
                  {group.reason ? <p className="mt-1 text-xs">{group.reason}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm">还没有预览数据，点击“生成全量预览”。</p>
        )}
      </CardContent>
    </Card>
  );
}
