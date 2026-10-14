import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface MonorepoInfo {
  detected: boolean;
  reason?: string;
}

export function detectMonorepo(cwd: string = process.cwd()): MonorepoInfo {
  if (existsSync(resolve(cwd, "turbo.json"))) {
    return { detected: true, reason: "turbo.json found" };
  }

  if (existsSync(resolve(cwd, "packages"))) {
    return { detected: true, reason: "packages/ directory found" };
  }

  if (existsSync(resolve(cwd, "apps"))) {
    return { detected: true, reason: "apps/ directory found" };
  }

  const packageJsonPath = resolve(cwd, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      if (packageJson.workspaces) {
        return { detected: true, reason: "workspaces found in package.json" };
      }
    } catch {
    }
  }

  if (existsSync(resolve(cwd, "pnpm-workspace.yaml"))) {
    return { detected: true, reason: "pnpm-workspace.yaml found" };
  }

  return { detected: false };
}
