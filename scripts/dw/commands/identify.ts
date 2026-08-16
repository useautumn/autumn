import { originServiceUrls } from "../devProxy/routes.ts";
import { isPlainCanonical, isProvisioned } from "../helpers/entry.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { isHeadless } from "../helpers/headless.ts";
import { ensureNgrok, headlessPublicOrigin } from "../helpers/ngrok.ts";
import {
	aliasesFor,
	checkoutPortFor,
	leafPortFor,
	serverPortFor,
	vitePortFor,
} from "../helpers/ports.ts";
import { loadRegistry } from "../helpers/registry.ts";
import { tmuxSessionName } from "../helpers/tmux.ts";
import type { RegistryEntry } from "../types.ts";

function localServiceUrls({
	entry,
}: {
	entry: RegistryEntry;
}): ReturnType<typeof originServiceUrls> {
	const n = entry.worktreeNum;
	if (isProvisioned(entry) && !isHeadless()) {
		const aliases = aliasesFor(n);
		return {
			api: aliases.apiUrl,
			checkout: `http://localhost:${checkoutPortFor(n)}`,
			dashboard: aliases.viteUrl,
			leaf: `http://localhost:${leafPortFor(n)}`,
		};
	}
	return {
		api: `http://localhost:${serverPortFor(n)}`,
		checkout: `http://localhost:${checkoutPortFor(n)}`,
		dashboard: `http://localhost:${vitePortFor(n)}`,
		leaf: `http://localhost:${leafPortFor(n)}`,
	};
}

export function cmdIdentify(): void {
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	let entry = registry[cwd];
	if (!entry) {
		console.error(`[dw] no registered worktree at ${cwd}`);
		console.error(`     run 'bun dw' here first to provision one`);
		process.exit(1);
	}

	entry = ensureNgrok(entry, { quiet: true });

	const origin = headlessPublicOrigin({ entry });
	const urls = origin
		? originServiceUrls({ origin })
		: localServiceUrls({ entry });

	const n = entry.worktreeNum;
	const tmux =
		isProvisioned(entry) && n > 1
			? tmuxSessionName(n)
			: isPlainCanonical(entry)
				? ""
				: "";

	console.log(`#${n}  ${entry.path}`);
	console.log();
	console.log(`dashboard  ${urls.dashboard}`);
	console.log(`api        ${urls.api}`);
	console.log(`leaf       ${urls.leaf}`);
	console.log(`checkout   ${urls.checkout}`);
	console.log();
	console.log(`DW_WORKTREE_NUM=${n}`);
	console.log(`DW_DASHBOARD_URL=${urls.dashboard}`);
	console.log(`DW_API_URL=${urls.api}`);
	console.log(`DW_VITE_URL=${urls.dashboard}`);
	console.log(`DW_LEAF_URL=${urls.leaf}`);
	console.log(`DW_CHECKOUT_URL=${urls.checkout}`);
	console.log(`DW_PUBLIC_API_URL=${urls.api}`);
	console.log(`DW_NGROK_VITE_URL=${origin ? urls.dashboard : ""}`);
	console.log(`DW_TMUX_SESSION=${tmux}`);
	console.log(`DW_SERVER_PORT=${serverPortFor(n)}`);
	console.log(`DW_VITE_PORT=${vitePortFor(n)}`);
}
