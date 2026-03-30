import { cp, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const source = "public/manifest.json";
const target = "dist/manifest.json";

/**
 * 复制 manifest 到构建目录，确保扩展可直接加载。
 */
async function copyManifest() {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target);
}

copyManifest();
