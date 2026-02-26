import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const worktreeNum = Number.parseInt(process.argv[2] || "", 10);
if (Number.isNaN(worktreeNum) || worktreeNum < 2) {
	console.error("Usage: bun dx <N>  (where N >= 2)");
	console.error("  e.g. bun dx 2  -> vite:3100, server:8180, checkout:3101");
	process.exit(1);
}

const offset = (worktreeNum - 1) * 100;
const vitePort = 3000 + offset;
const serverPort = 8080 + offset;
const checkoutPort = 3001 + offset;

const portArgs = [
	`-ti:${vitePort}`,
	`-ti:${serverPort}`,
	`-ti:${checkoutPort}`,
].join(" ");
const killCmd = `lsof ${portArgs} | xargs kill -9 2>/dev/null || true`;
const devCmd = `ENV_FILE=.env infisical run --env=dev -- bun scripts/dev.ts --worktree ${worktreeNum}`;

const rootDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(rootDir, "..");

const proc = Bun.spawn(["sh", "-c", `${killCmd}; ${devCmd}`], {
	cwd: projectRoot,
	env: process.env,
	stdout: "inherit",
	stderr: "inherit",
});

process.on("SIGINT", () => proc.kill("SIGINT"));
process.on("SIGTERM", () => proc.kill("SIGTERM"));

await proc.exited;
process.exit(proc.exitCode ?? 0);
