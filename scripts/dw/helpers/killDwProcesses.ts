import { resolve } from "node:path";
import { PROJECT_ROOT } from "../constants.ts";
import { appPortsFor } from "./ports.ts";
import { loadRegistry } from "./registry.ts";
import { log, sh } from "./shell.ts";
import { killTmuxSession } from "./tmux.ts";

export type ProcessRow = {
	pid: number;
	ppid: number;
	command: string;
	cwd?: string;
};

const SCANNER_RE =
	/^\s*(?:rg|grep|egrep|fgrep|fd|lsof|ps|vim|nvim|less|more|code|cursor)\b/;

export function isIgnoredKillCommand({ command }: { command: string }): boolean {
	return (
		SCANNER_RE.test(command) ||
		command.includes("kill:dw") ||
		/scripts\/dw\/index\.ts\s+kill(?:\s|$)/.test(command) ||
		command.includes("bun test")
	);
}

export function isUnderWorktree({
	path,
	worktreeRoots,
}: {
	path: string;
	worktreeRoots: string[];
}): boolean {
	const resolved = resolve(path);
	return worktreeRoots.some(
		(root) => resolved === root || resolved.startsWith(`${root}/`),
	);
}

/** The dw CLI actually running a stack — not list/setup/teardown/kill. */
export function isDwRunCli({ command }: { command: string }): boolean {
	if (isIgnoredKillCommand({ command })) return false;
	if (/scripts\/dw\/index\.ts\s+run(?:\s|$)/.test(command)) return true;
	return command.includes("bun dw run");
}

/** `bun dw run` always starts scripts/dev.ts with --worktree. Bare `bun dev` does not. */
export function isDwDevSupervisor({ command }: { command: string }): boolean {
	if (isIgnoredKillCommand({ command })) return false;
	return (
		command.includes("scripts/dev.ts") && command.includes("--worktree")
	);
}

export function isDwOrphan({
	command,
	cwd,
	worktreeRoots,
}: {
	command: string;
	cwd?: string;
	worktreeRoots: string[];
}): boolean {
	if (isIgnoredKillCommand({ command })) return false;
	const inWorktree =
		(cwd !== undefined && isUnderWorktree({ path: cwd, worktreeRoots })) ||
		worktreeRoots.some((root) => command.includes(`${root}/`));
	if (!inWorktree) return false;

	return (
		command.includes("nodemon") ||
		/bun(?:\s+--watch)?\s+src\/index\.ts/.test(command) ||
		command.includes("src/workers.ts") ||
		command.includes("triggerDevBranchReaper.ts") ||
		command.includes("concurrently") ||
		command.includes("trigger dev") ||
		/(?:^|[/\s])vite(?:\s|$)/.test(command)
	);
}

export function selectDwPids({
	processes,
	worktreeRoots,
	extraSeedPids,
	protectedPids,
}: {
	processes: ProcessRow[];
	worktreeRoots: string[];
	extraSeedPids: number[];
	protectedPids: Set<number>;
}): number[] {
	const childrenByParent = new Map<number, number[]>();
	for (const row of processes) {
		const list = childrenByParent.get(row.ppid) ?? [];
		list.push(row.pid);
		childrenByParent.set(row.ppid, list);
	}

	const seeds = new Set<number>();
	for (const pid of extraSeedPids) {
		if (pid > 1 && !protectedPids.has(pid)) seeds.add(pid);
	}
	for (const row of processes) {
		if (protectedPids.has(row.pid)) continue;
		if (
			isDwRunCli({ command: row.command }) ||
			isDwDevSupervisor({ command: row.command }) ||
			isDwOrphan({
				command: row.command,
				cwd: row.cwd,
				worktreeRoots,
			})
		) {
			seeds.add(row.pid);
		}
	}

	const selected = new Set<number>();
	const stack = [...seeds];
	while (stack.length > 0) {
		const pid = stack.pop();
		if (pid === undefined || selected.has(pid) || protectedPids.has(pid)) {
			continue;
		}
		selected.add(pid);
		for (const child of childrenByParent.get(pid) ?? []) {
			stack.push(child);
		}
	}

	return [...selected].sort((a, b) => a - b);
}

function parsePs({ stdout }: { stdout: string }): ProcessRow[] {
	const rows: ProcessRow[] = [];
	for (const line of stdout.split("\n")) {
		const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
		if (!match) continue;
		rows.push({
			pid: Number(match[1]),
			ppid: Number(match[2]),
			command: match[3] ?? "",
		});
	}
	return rows;
}

function ancestorPids({
	pid,
	ppidByPid,
}: {
	pid: number;
	ppidByPid: Map<number, number>;
}): number[] {
	const chain: number[] = [];
	let current: number | undefined = pid;
	const seen = new Set<number>();
	while (current && current > 1 && !seen.has(current)) {
		seen.add(current);
		chain.push(current);
		current = ppidByPid.get(current);
	}
	return chain;
}

function cwdByPid({ pids }: { pids: number[] }): Map<number, string> {
	const cwd = new Map<number, string>();
	if (pids.length === 0) return cwd;
	const lsof = sh("lsof", ["-a", "-d", "cwd", "-Fn", "-p", pids.join(",")]);
	let current: number | undefined;
	for (const line of lsof.stdout.split("\n")) {
		if (line.startsWith("p")) {
			current = Number(line.slice(1));
			continue;
		}
		if (line.startsWith("n") && current && current > 1) {
			cwd.set(current, line.slice(1));
		}
	}
	return cwd;
}

function needsCwd({ command }: { command: string }): boolean {
	return (
		command.includes("nodemon") ||
		/bun(?:\s+--watch)?\s+src\/index\.ts/.test(command) ||
		command.includes("src/workers.ts") ||
		command.includes("concurrently")
	);
}

function listenerPids({ ports }: { ports: number[] }): number[] {
	if (ports.length === 0) return [];
	const lsof = sh(
		"lsof",
		ports.flatMap((port) => ["-ti", `:${port}`]),
	);
	return [
		...new Set(
			lsof.stdout
				.split("\n")
				.map((pid) => Number(pid))
				.filter((pid) => Number.isInteger(pid) && pid > 1),
		),
	];
}

function nodemonParentsOf({
	listenerPids: listeners,
	processes,
}: {
	listenerPids: number[];
	processes: ProcessRow[];
}): number[] {
	const byPid = new Map(processes.map((row) => [row.pid, row]));
	const parents: number[] = [];
	for (const pid of listeners) {
		const child = byPid.get(pid);
		const parent = child ? byPid.get(child.ppid) : undefined;
		if (parent && parent.command.includes("nodemon")) parents.push(parent.pid);
	}
	return parents;
}

function dwTmuxSessions({ stdout }: { stdout: string }): string[] {
	return stdout
		.split("\n")
		.map((name) => name.trim())
		.filter((name) => /^dw-wt-\d+$/.test(name));
}

export function worktreeRootsFrom({
	registryPaths,
	projectRoot,
}: {
	registryPaths: string[];
	projectRoot: string;
}): string[] {
	return [...new Set([...registryPaths, projectRoot].map((path) => resolve(path)))];
}

export function cmdKillDwProcesses(): void {
	if (process.env.NODE_ENV === "production") {
		log("refusing to kill dw processes in production");
		return;
	}

	const registry = loadRegistry();
	const worktreeRoots = worktreeRootsFrom({
		registryPaths: Object.keys(registry),
		projectRoot: PROJECT_ROOT,
	});
	const ports = [
		...new Set(
			Object.values(registry).flatMap((entry) =>
				appPortsFor(entry.worktreeNum),
			),
		),
	];

	const processes = parsePs({
		stdout: sh("ps", ["-axo", "pid=", "ppid=", "command="]).stdout,
	});
	const ppidByPid = new Map(processes.map((row) => [row.pid, row.ppid]));
	const protectedPids = new Set(
		ancestorPids({ pid: process.pid, ppidByPid }),
	);

	const cwdCandidates = processes
		.filter((row) => needsCwd({ command: row.command }))
		.map((row) => row.pid);
	const cwds = cwdByPid({ pids: cwdCandidates });
	const withCwd = processes.map((row) => ({
		...row,
		cwd: cwds.get(row.pid),
	}));

	const extraSeedPids = [
		...listenerPids({ ports }),
	];
	extraSeedPids.push(
		...nodemonParentsOf({
			listenerPids: extraSeedPids,
			processes: withCwd,
		}),
	);

	const pids = selectDwPids({
		processes: withCwd,
		worktreeRoots,
		extraSeedPids,
		protectedPids,
	});

	for (const pid of pids) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}

	const sessions = dwTmuxSessions({
		stdout: sh("tmux", ["list-sessions", "-F", "#{session_name}"]).stdout,
	});
	for (const name of sessions) {
		killTmuxSession(name);
	}

	if (pids.length === 0 && sessions.length === 0) {
		log("no bun dw run processes found");
		return;
	}
	log(
		`killed ${pids.length} bun dw process(es)${
			sessions.length > 0 ? `, ${sessions.length} tmux session(s)` : ""
		}`,
	);
}
