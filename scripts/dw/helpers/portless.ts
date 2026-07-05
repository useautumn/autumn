import type { WorktreeAliases } from "../types.ts";
import { aliasesFor } from "./ports.ts";
import { fatal, log, sh } from "./shell.ts";

export function registerPortlessAliases(worktreeNum: number): WorktreeAliases {
	const offset = (worktreeNum - 1) * 100;
	const aliases = aliasesFor(worktreeNum);
	const SERVER_PORT = 8080 + offset;
	const VITE_PORT = 3000 + offset;

	for (const [name, port] of [
		[`wt${worktreeNum}-api`, SERVER_PORT],
		[`wt${worktreeNum}`, VITE_PORT],
	] as const) {
		const res = sh("portless", ["alias", name, String(port), "--force"]);
		if (res.code !== 0) {
			fatal(`portless alias ${name} -> ${port} failed: ${res.stderr}`);
		}
	}
	log(
		`portless: ${aliases.viteUrl} → :${VITE_PORT}, ${aliases.apiUrl} → :${SERVER_PORT}`,
	);
	return aliases;
}

export function unregisterPortlessAliases(worktreeNum: number): void {
	for (const name of [`wt${worktreeNum}-api`, `wt${worktreeNum}`]) {
		sh("portless", ["alias", "--remove", name]);
	}
}
