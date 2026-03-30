import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { COMMANDS } from "@/shared/message-contract";
import type { AppConfig } from "@/shared/types";
import { sendRuntimeMessage } from "../api/runtime-client";

const EMPTY_CONFIG: AppConfig = {
  apiKey: "",
  baseUrl: "",
  model: ""
};

/**
 * 设置页：维护 OpenAI 配置项。
 */
export function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await sendRuntimeMessage(COMMANDS.CONFIG_GET, {});
        setConfig(data.config ?? EMPTY_CONFIG);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "读取设置失败。");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /**
   * 保存设置。
   */
  async function onSave() {
    setLoading(true);
    setStatus("");
    try {
      await sendRuntimeMessage(COMMANDS.CONFIG_SET, { config });
      setStatus("设置已保存。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b-2 border-border">
        <CardTitle className="text-lg">模型设置</CardTitle>
        <CardDescription>配置 API Key / Base URL / Model</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <label className="grid gap-2 text-sm">
            <span>API Key</span>
            <Input
              type="password"
              value={config.apiKey}
              onChange={(event) => setConfig({ ...config, apiKey: event.target.value })}
              placeholder="sk-..."
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>Base URL</span>
            <Input
              value={config.baseUrl}
              onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>Model</span>
            <Input
              value={config.model}
              onChange={(event) => setConfig({ ...config, model: event.target.value })}
              placeholder="gpt-4.1-mini"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void onSave()} disabled={loading}>
            {loading ? "保存中..." : "保存设置"}
          </Button>
        </div>
        {status ? (
          <div className="rounded-base border-2 border-border bg-secondary-background px-3 py-2 text-sm">
            {status}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
