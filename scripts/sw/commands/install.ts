import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	herdrConfigPath,
	SCRIPT_DIR,
	STABLE_CLI_DIR,
	STABLE_DIR,
	STABLE_PLUGIN_DIR,
	STABLE_WRAPPER,
} from "../constants.ts";
import { fatal, log, shInherit } from "../helpers/shell.ts";

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

export function cmdInstall(): void {
	if (SCRIPT_DIR === STABLE_CLI_DIR) {
		fatal("run `sw install` from a repo checkout, not the installed copy");
	}

	// Copy the whole sw tree OUT of the worktree. So the wrapper, plugin, and CLI
	// never depend on a worktree that may be deleted or branched off a commit
	// without scripts/sw. Re-running refreshes the installed copy.
	mkdirSync(STABLE_DIR, { recursive: true });
	rmSync(STABLE_CLI_DIR, { recursive: true, force: true });
	cpSync(SCRIPT_DIR, STABLE_CLI_DIR, { recursive: true });
	for (const rel of [
		"shell/worktree-shell.sh",
		"remote/provision.sh",
		"remote/herdr-agent-state.sh",
	]) {
		chmodSync(join(STABLE_CLI_DIR, rel), 0o755);
	}
	log(`installed sw -> ${STABLE_CLI_DIR}`);

	const configPath = herdrConfigPath();
	mkdirSync(dirname(configPath), { recursive: true });
	const existing = existsSync(configPath)
		? readFileSync(configPath, "utf8")
		: "";
	writeFileSync(configPath, setTerminalDefaultShell(existing, STABLE_WRAPPER));
	log(`set [terminal] default_shell = "${STABLE_WRAPPER}" in ${configPath}`);

	log("linking herdr plugin (from the stable copy)");
	shInherit("herdr", ["plugin", "link", STABLE_PLUGIN_DIR]);
	shInherit("herdr", ["server", "reload-config"]);

	log("done. New @autumn worktrees will prompt local/exe.dev on creation.");
	log(
		"note: exe.dev (`ssh exe.dev`), neon, and infisical must be authed on this Mac.",
	);
}
