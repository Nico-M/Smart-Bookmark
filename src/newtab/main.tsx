import ReactDOM from "react-dom/client";
import { App } from "./App";
import "../index.css";

/**
 * 挂载 newtab React 应用。
 */
function bootstrap() {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("缺少 #root 挂载节点。");
  }
  ReactDOM.createRoot(root).render(<App />);
}

bootstrap();
