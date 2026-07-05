import { isPlainCanonical, isProvisioned } from "../helpers/entry.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { aliasesFor } from "../helpers/ports.ts";
import { loadRegistry } from "../helpers/registry.ts";
import { tmuxSessionName } from "../helpers/tmux.ts";

export function cmdIdentify(): void {
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry) {
		console.error(`[dw] no registered worktree at ${cwd}`);
		console.error(`     run 'bun dw' here first to provision one`);
		process.exit(1);
	}

	const { worktreeNum, branchName, gitBranch } = entry;
	const offset = (worktreeNum - 1) * 100;
	const serverPort = 8080 + offset;
	const vitePort = 3000 + offset;

	let serverUrl: string;
	let viteUrl: string;
	let tmux = "";
	if (isProvisioned(entry)) {
		const aliases = aliasesFor(worktreeNum);
		serverUrl = aliases.apiUrl;
		viteUrl = aliases.viteUrl;
		if (worktreeNum > 1) tmux = tmuxSessionName(worktreeNum);
	} else {
		serverUrl = `http://localhost:${serverPort}`;
		viteUrl = `http://localhost:${vitePort}`;
	}

	const tmuxHuman =
		tmux ||
		(isPlainCanonical(entry)
			? "(canonical worktree — not in tmux)"
			: "(inline dev)");
	const ngrokUrl = entry.ngrokUrl ?? "";
	const ngrokHuman =
		ngrokUrl ||
		(isProvisioned(entry)
			? "(no public tunnel — run 'bun dw setup')"
			: "(canonical — no ngrok)");

	const branchLabel =
		gitBranch && worktreeNum === 1
			? `${gitBranch} (neon: ${branchName})`
			: (branchName ?? "(canonical)");

	console.log(`Worktree #${worktreeNum}  (${entry.path})`);
	console.log(`  Branch:        ${branchLabel}`);
	console.log(`  Server URL:    ${serverUrl}`);
	console.log(`  Vite URL:      ${viteUrl}`);
	console.log(`  Ngrok URL:     ${ngrokHuman}`);
	console.log(`  Tmux session:  ${tmuxHuman}`);
	console.log(`  Server port:   ${serverPort}`);
	console.log(`  Vite port:     ${vitePort}`);
	console.log();
	console.log(`DW_WORKTREE_NUM=${worktreeNum}`);
	console.log(`DW_SERVER_URL=${serverUrl}`);
	console.log(`DW_VITE_URL=${viteUrl}`);
	console.log(`DW_NGROK_URL=${ngrokUrl}`);
	console.log(`DW_TMUX_SESSION=${tmux}`);
	console.log(`DW_SERVER_PORT=${serverPort}`);
	console.log(`DW_VITE_PORT=${vitePort}`);
}
