import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { PROVISION_SH, SCRIPT_DIR, WRAPPER_SH } from "../constants.ts";
import { log, shInherit } from "../helpers/shell.ts";

function herdrConfigPath(): string {
	const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
	return join(base, "herdr", "config.toml");
}

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
	for (const script of [
		WRAPPER_SH,
		PROVISION_SH,
		join(SCRIPT_DIR, "remote/herdr-agent-state.sh"),
	]) {
		chmodSync(script, 0o755);
	}

	const configPath = herdrConfigPath();
	mkdirSync(dirname(configPath), { recursive: true });
	const existing = existsSync(configPath)
		? readFileSync(configPath, "utf8")
		: "";
	if (existing.includes(WRAPPER_SH)) {
		log(`default_shell already points at the wrapper (${configPath})`);
	} else {
		writeFileSync(configPath, setTerminalDefaultShell(existing, WRAPPER_SH));
		log(`set [terminal] default_shell = "${WRAPPER_SH}" in ${configPath}`);
	}

	log("linking herdr plugin");
	shInherit("herdr", ["plugin", "link", join(SCRIPT_DIR, "plugin")]);
	shInherit("herdr", ["server", "reload-config"]);

	log("done. New @autumn worktrees will prompt local/exe.dev on creation.");
	log(
		"note: exe.dev (`ssh exe.dev`), neon, and infisical must be authed on this Mac.",
	);
}
