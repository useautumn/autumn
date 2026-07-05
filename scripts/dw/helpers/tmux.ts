import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fatal, log, sh } from "./shell.ts";

export function tmuxSessionName(worktreeNum: number): string {
	return `dw-wt-${worktreeNum}`;
}

export function ensureTmuxInstalled(): void {
	const res = sh("which", ["tmux"]);
	if (res.code !== 0 || !res.stdout) {
		fatal("tmux not found on PATH; install tmux to use headless dev wrapping");
	}
}

export function tmuxSessionExists(name: string): boolean {
	const res = sh("tmux", ["has-session", "-t", name]);
	return res.code === 0;
}

export function killTmuxSession(name: string): void {
	if (!tmuxSessionExists(name)) return;
	sh("tmux", ["kill-session", "-t", name]);
}

export function spawnDevInTmux(
	name: string,
	env: Record<string, string>,
	args: string[],
	cwd: string,
): void {
	ensureTmuxInstalled();
	if (tmuxSessionExists(name)) {
		log(`tmux session ${name} already exists, killing first`);
		killTmuxSession(name);
	}

	// Single-quote and escape each env value safely for shell.
	const exports = Object.entries(env)
		.map(([k, v]) => {
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return "";
			const escaped = String(v).replace(/'/g, "'\\''");
			return `export ${k}='${escaped}'`;
		})
		.filter(Boolean)
		.join("\n");

	const quotedArgs = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
	const script = `#!/usr/bin/env bash\nset -e\ncd '${cwd.replace(/'/g, "'\\''")}'\n${exports}\nexec ${quotedArgs}\n`;
	const scriptPath = join(
		tmpdir(),
		`dw-tmux-${name}-${process.pid}-${Date.now()}.sh`,
	);
	writeFileSync(scriptPath, script, { mode: 0o700 });

	const res = sh("tmux", ["new-session", "-d", "-s", name, "bash", scriptPath]);
	if (res.code !== 0) {
		if (existsSync(scriptPath)) rmSync(scriptPath, { force: true });
		fatal(`tmux new-session failed: ${res.stderr || res.stdout}`);
	}

	// tmux has spawned bash which holds the script open; safe to delete shortly.
	// Give it a brief tick by deferring removal via a separate shell.
	sh("bash", ["-c", `(sleep 5 && rm -f '${scriptPath}') >/dev/null 2>&1 &`]);
	log(
		`started dev inside tmux session ${name} (use 'bun dw logs' / 'bun dw attach')`,
	);
}
