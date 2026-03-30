import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HomePage } from "./pages/Home";
import { OrganizerPage } from "./pages/Organizer";
import { SettingsPage } from "./pages/Settings";

type TabKey = "home" | "organizer" | "settings";

/**
 * newtab 应用入口，负责页面切换。
 */
export function App() {
  const [tab, setTab] = useState<TabKey>("home");

  return (
    <div className="h-screen overflow-hidden bg-[linear-gradient(to_right,#00000026_1px,transparent_1px),linear-gradient(to_bottom,#00000026_1px,transparent_1px)] bg-[size:36px_36px] p-4 md:p-8">
      <main className="mx-auto flex h-full w-full max-w-6xl min-h-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-base border-2 border-border bg-main px-4 py-3 text-main-foreground shadow-shadow">
          <h1 className="text-xl md:text-2xl">Bookmark Organizer</h1>
          <Badge variant="neutral">Neobrutalism UI</Badge>
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as TabKey)}
          className="flex w-full min-h-0 flex-1 flex-col"
        >
          <TabsList className="h-auto w-full shrink-0 flex-wrap justify-start gap-2 bg-secondary-background">
            <TabsTrigger value="home">书签</TabsTrigger>
            <TabsTrigger value="organizer">整理</TabsTrigger>
            <TabsTrigger value="settings">设置</TabsTrigger>
          </TabsList>
          <TabsContent value="home" className="min-h-0 flex-1 overflow-hidden">
            <HomePage />
          </TabsContent>
          <TabsContent value="organizer" className="min-h-0 flex-1 overflow-y-auto pr-1">
            <OrganizerPage />
          </TabsContent>
          <TabsContent value="settings" className="min-h-0 flex-1 overflow-y-auto pr-1">
            <SettingsPage />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
