import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function isPortInUse({ port }: { port: number }): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ port, host: "127.0.0.1" });
		socket.on("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.on("error", () => {
			socket.destroy();
			resolve(false);
		});
	});
}

async function findFreeWorktree(): Promise<number> {
	for (let n = 2; n <= 10; n++) {
		const serverPort = 8080 + (n - 1) * 100;
		if (!(await isPortInUse({ port: serverPort }))) return n;
	}
	console.error("No free worktree slots (2-10). All server ports in use.");
	process.exit(1);
}

// Allow explicit override: `bun dx 3`, otherwise auto-detect
const explicitArg = Number.parseInt(process.argv[2] || "", 10);
const worktreeNum =
	!Number.isNaN(explicitArg) && explicitArg >= 2
		? explicitArg
		: await findFreeWorktree();

const offset = (worktreeNum - 1) * 100;
const vitePort = 3000 + offset;
const serverPort = 8080 + offset;
const checkoutPort = 3001 + offset;

console.log(
	`Worktree ${worktreeNum} -> vite:${vitePort}, server:${serverPort}, checkout:${checkoutPort}\n`,
);

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
