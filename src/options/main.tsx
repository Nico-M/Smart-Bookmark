import ReactDOM from "react-dom/client";
import { SettingsPage } from "@/newtab/pages/Settings";
import "@/index.css";

/**
 * 挂载 options 页面，复用设置页组件。
 */
function bootstrap() {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("缺少 #root 挂载节点。");
  }
  ReactDOM.createRoot(root).render(<SettingsPage />);
}

bootstrap();
