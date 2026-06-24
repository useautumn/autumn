import { existsSync } from "node:fs";
import Bun from "bun";

/**
 * Run a command in the foreground inheriting this process's stdio, then exit with
 * its code. Used to hand the pane off to tmux / ssh / a shell — the CLI becomes a
 * thin parent of that long-lived foreground process.
 */
export function execForeground(
	cmd: string,
	args: string[],
	opts: { cwd?: string } = {},
): never {
	const proc = Bun.spawnSync([cmd, ...args], {
		cwd: opts.cwd,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	process.exit(proc.exitCode ?? 0);
}

/** The user's real login shell (never $SHELL — that may be the sw wrapper). */
export function realShell(): string {
	const override = process.env.SW_REAL_SHELL;
	if (override && existsSync(override)) return override;
	for (const candidate of ["/bin/zsh", "/bin/bash", "/bin/sh"]) {
		if (existsSync(candidate)) return candidate;
	}
	return "/bin/sh";
}
