import { log, sh } from "./shell.ts";

const DRAIN_TIMEOUT_MS = 30_000;
const DRAIN_POLL_MS = 100;

function listenerPids(port: number): number[] {
	const result = sh("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"]);
	if (result.code !== 0 || !result.stdout) return [];
	return result.stdout
		.split("\n")
		.map(Number)
		.filter((pid) => Number.isInteger(pid) && pid > 1);
}

function parentPid(pid: number): number | undefined {
	const result = sh("ps", ["-o", "ppid=", "-p", String(pid)]);
	const parent = Number(result.stdout);
	if (result.code !== 0 || !Number.isInteger(parent) || parent <= 1) return;
	return parent;
}

function commandFor(pid: number): string {
	return sh("ps", ["-o", "args=", "-p", String(pid)]).stdout;
}

function devStackPid({
	listenerPid,
	worktreeNum,
}: {
	listenerPid: number;
	worktreeNum: number;
}): number | undefined {
	const expectedCommand = `scripts/dev.ts --worktree ${worktreeNum}`;
	let pid: number | undefined = listenerPid;
	for (let depth = 0; pid && depth < 16; depth++) {
		if (commandFor(pid).includes(expectedCommand)) return pid;
		pid = parentPid(pid);
	}
}

function signalProcess(pid: number): void {
	try {
		process.kill(pid, "SIGTERM");
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause;
	}
}

export async function stopBalanceWorker({
	port,
	worktreeNum,
}: {
	port: number;
	worktreeNum: number;
}): Promise<void> {
	if (process.env.NODE_ENV === "production" || process.platform === "win32") {
		return;
	}
	const listeners = listenerPids(port);
	if (listeners.length === 0) return;

	const targets = new Set(
		listeners.map(
			(listenerPid) => devStackPid({ listenerPid, worktreeNum }) ?? listenerPid,
		),
	);
	for (const target of targets) signalProcess(target);

	const deadline = Date.now() + DRAIN_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (listenerPids(port).length === 0) {
			log(`stopped existing balance worker on :${port}`);
			return;
		}
		await Bun.sleep(DRAIN_POLL_MS);
	}
	throw new Error(
		`Balance worker on :${port} did not drain within ${DRAIN_TIMEOUT_MS}ms`,
	);
}
