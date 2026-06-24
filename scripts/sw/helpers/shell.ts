import Bun from "bun";

export function log(msg: string): void {
	console.log(`[sw] ${msg}`);
}

export function fatal(msg: string): never {
	console.error(`[sw] ${msg}`);
	process.exit(1);
}

export function sh(
	cmd: string,
	args: string[],
	opts: { cwd?: string; env?: Record<string, string>; stdin?: string } = {},
): { stdout: string; stderr: string; code: number } {
	const proc = Bun.spawnSync([cmd, ...args], {
		cwd: opts.cwd,
		env: opts.env ?? (process.env as Record<string, string>),
		stdin: opts.stdin ? new TextEncoder().encode(opts.stdin) : undefined,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		stdout: new TextDecoder().decode(proc.stdout).trim(),
		stderr: new TextDecoder().decode(proc.stderr).trim(),
		code: proc.exitCode ?? 1,
	};
}

// Streams stdio so the caller can watch progress (provisioning, ssh, rsync).
export function shInherit(
	cmd: string,
	args: string[],
	opts: { cwd?: string; env?: Record<string, string> } = {},
): number {
	const proc = Bun.spawnSync([cmd, ...args], {
		cwd: opts.cwd,
		env: opts.env ?? (process.env as Record<string, string>),
		stdout: "inherit",
		stderr: "inherit",
		stdin: "inherit",
	});
	return proc.exitCode ?? 1;
}
