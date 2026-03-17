import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface MonorepoInfo {
  detected: boolean;
  reason?: string;
}

/**
 * Detects if the current directory is part of a monorepo.
 * Checks in order:
 * 1. turbo.json exists
 * 2. packages/ directory exists
 * 3. apps/ directory exists
 * 4. package.json has "workspaces" key
 * 5. pnpm-workspace.yaml exists
 */
export function detectMonorepo(cwd: string = process.cwd()): MonorepoInfo {
  // Check for turbo.json
  if (existsSync(resolve(cwd, "turbo.json"))) {
    return { detected: true, reason: "turbo.json found" };
  }

  // Check for packages/ directory
  if (existsSync(resolve(cwd, "packages"))) {
    return { detected: true, reason: "packages/ directory found" };
  }

  // Check for apps/ directory
  if (existsSync(resolve(cwd, "apps"))) {
    return { detected: true, reason: "apps/ directory found" };
  }

  // Check for workspaces in package.json
  const packageJsonPath = resolve(cwd, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      if (packageJson.workspaces) {
        return { detected: true, reason: "workspaces found in package.json" };
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for pnpm-workspace.yaml
  if (existsSync(resolve(cwd, "pnpm-workspace.yaml"))) {
    return { detected: true, reason: "pnpm-workspace.yaml found" };
  }

  return { detected: false };
}
