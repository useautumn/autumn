import chalk from "chalk";
import type { PublicServiceUrls } from "../devProxy/cloudflareConfig.ts";
import { emulateGoogleUrl } from "../helpers/emulate.ts";
import { isPlainCanonical, isProvisioned } from "../helpers/entry.ts";
import {
	aliasesFor,
	checkoutPortFor,
	leafPortFor,
	serverPortFor,
	vitePortFor,
} from "../helpers/ports.ts";
import { entryPublicServiceUrls } from "../helpers/publicUrls.ts";
import { resolveCurrentEntryOrFatal } from "../helpers/registry.ts";
import { tmuxSessionName } from "../helpers/tmux.ts";
import type { RegistryEntry } from "../types.ts";

function localServiceUrls({
	entry,
}: {
	entry: RegistryEntry;
}): PublicServiceUrls {
	const n = entry.worktreeNum;
	if (isProvisioned(entry)) {
		const aliases = aliasesFor(n);
		return {
			api: aliases.apiUrl,
			checkout: `http://localhost:${checkoutPortFor(n)}`,
			emulate: emulateGoogleUrl({}),
			leaf: `http://localhost:${leafPortFor(n)}`,
			vite: aliases.viteUrl,
		};
	}
	return {
		api: `http://localhost:${serverPortFor(n)}`,
		checkout: `http://localhost:${checkoutPortFor(n)}`,
		emulate: emulateGoogleUrl({}),
		leaf: `http://localhost:${leafPortFor(n)}`,
		vite: `http://localhost:${vitePortFor(n)}`,
	};
}

export function cmdIdentify(): void {
	const entry = resolveCurrentEntryOrFatal("bun dw identify");
	const local = localServiceUrls({ entry });
	const publicUrls = entryPublicServiceUrls(entry);

	const n = entry.worktreeNum;
	const tmux =
		isProvisioned(entry) && n > 1
			? tmuxSessionName(n)
			: isPlainCanonical(entry)
				? ""
				: "";

	const row = (label: string, value: string) => {
		console.log(`  ${label.padEnd(12)}${value}`);
	};
	const heading = (label: string) => {
		console.log(`  ${chalk.bold.cyan(label)}`);
	};

	console.log(`#${n}  ${entry.path}`);
	if (publicUrls) {
		heading("local");
		row("dashboard", local.vite);
		row("backend", local.api);
		row("leaf", local.leaf);
		row("checkout", local.checkout);
		row("emulate", local.emulate);
		console.log();
		heading("public");
		row("dashboard", publicUrls.vite);
		row("backend", publicUrls.api);
		row("leaf", publicUrls.leaf);
		row("checkout", publicUrls.checkout);
		row("emulate", publicUrls.emulate);
	} else {
		row("dashboard", local.vite);
		row("backend", local.api);
		row("leaf", local.leaf);
		row("checkout", local.checkout);
		row("emulate", local.emulate);
	}
	console.log();
	console.log(`DW_WORKTREE_NUM=${n}`);
	console.log(`DW_DASHBOARD_URL=${local.vite}`);
	console.log(`DW_API_URL=${local.api}`);
	console.log(`DW_VITE_URL=${local.vite}`);
	console.log(`DW_LEAF_URL=${local.leaf}`);
	console.log(`DW_CHECKOUT_URL=${local.checkout}`);
	console.log(`DW_EMULATE_URL=${local.emulate}`);
	console.log(`DW_PUBLIC_URL=${publicUrls?.vite ?? ""}`);
	console.log(`DW_PUBLIC_API_URL=${publicUrls?.api ?? local.api}`);
	console.log(`DW_NGROK_VITE_URL=${publicUrls?.vite ?? ""}`);
	console.log(`DW_TMUX_SESSION=${tmux}`);
	console.log(`DW_SERVER_PORT=${serverPortFor(n)}`);
	console.log(`DW_VITE_PORT=${vitePortFor(n)}`);
}
