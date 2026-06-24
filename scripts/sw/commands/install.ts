import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
	herdrConfigPath,
	STABLE_DIR,
	STABLE_WRAPPER,
	WRAPPER_SH,
} from "../constants.ts";
import { log, shInherit } from "../helpers/shell.ts";

/** Upsert `default_shell` inside the `[terminal]` table, preserving the rest. */
function setTerminalDefaultShell(toml: string, shellPath: string): string {
	const line = `default_shell = "${shellPath}"`;
	const lines = toml.split(/\r?\n/);
	let termStart = -1;
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*\[terminal\]\s*$/.test(lines[i])) {
			termStart = i;
			break;
		}
	}
	if (termStart === -1) {
		const sep = toml.trim().length ? "\n\n" : "";
		return `${toml.replace(/\n+$/, "")}${sep}[terminal]\n${line}\n`;
	}
	let termEnd = lines.length;
	for (let i = termStart + 1; i < lines.length; i++) {
		if (/^\s*\[/.test(lines[i])) {
			termEnd = i;
			break;
		}
	}
	for (let i = termStart + 1; i < termEnd; i++) {
		if (/^\s*default_shell\s*=/.test(lines[i])) {
			lines[i] = line;
			return lines.join("\n");
		}
	}
	lines.splice(termStart + 1, 0, line);
	return lines.join("\n");
}

/**
 * Install the wrapper as herdr's global `default_shell`, so every pane in a remote
 * worktree auto-ssh's into its box. The wrapper is copied OUT of the worktree to a
 * stable path so deleting the source worktree can't dangle the global shell.
 */
export function cmdInstall(): void {
	mkdirSync(STABLE_DIR, { recursive: true });
	copyFileSync(WRAPPER_SH, STABLE_WRAPPER);
	chmodSync(STABLE_WRAPPER, 0o755);
	log(`installed wrapper -> ${STABLE_WRAPPER}`);

	const configPath = herdrConfigPath();
	mkdirSync(dirname(configPath), { recursive: true });
	const existing = existsSync(configPath)
		? readFileSync(configPath, "utf8")
		: "";
	writeFileSync(configPath, setTerminalDefaultShell(existing, STABLE_WRAPPER));
	log(`set [terminal] default_shell = "${STABLE_WRAPPER}" in ${configPath}`);

	shInherit("herdr", ["server", "reload-config"]);
	log("done. Remote worktree panes now auto-ssh; local panes are unaffected.");
}
