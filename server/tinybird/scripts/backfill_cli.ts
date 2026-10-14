#!/usr/bin/env bun

import * as readline from "readline";
import {
	DEFAULT_CHUNK_DAYS,
	type TableConfig,
	runTableBackfill,
} from "./backfill_base.js";

const TABLE_CONFIGS: TableConfig[] = [
	{
		label: "customers",
		copyPipeName: "customers_backfill",
		datasource: "customers",
		startEpochMs: 1706987055000,
	},
	{
		label: "invoices",
		copyPipeName: "invoices_backfill",
		datasource: "invoices",
		startEpochMs: 1706987056000,
	},
	{
		label: "organizations",
		copyPipeName: "organizations_backfill",
		datasource: "organizations",
		startEpochMs: 1737543151220,
	},
	{
		label: "customer_products",
		copyPipeName: "customer_products_backfill",
		datasource: "customer_products",
		startEpochMs: 1677713742000,
	},
	{
		label: "customer_entitlements",
		copyPipeName: "customer_entitlements_backfill",
		datasource: "customer_entitlements",
		startEpochMs: 1738268254191,
	},
	{
		label: "customer_prices",
		copyPipeName: "customer_prices_backfill",
		datasource: "customer_prices",
		startEpochMs: 1738341655109,
	},
	{
		label: "replaceables",
		copyPipeName: "replaceables_backfill",
		datasource: "replaceables",
		startEpochMs: 1751360953240,
	},
	{
		label: "entitlements",
		copyPipeName: "entitlements_backfill",
		datasource: "entitlements",
		startEpochMs: 1737570713388,
	},
	{
		label: "free_trials",
		copyPipeName: "free_trials_backfill",
		datasource: "free_trials",
		startEpochMs: 1738168893927,
	},
	{
		label: "entities",
		copyPipeName: "entities_backfill",
		datasource: "entities",
		startEpochMs: 1743685142432,
	},
	{
		label: "subscriptions",
		copyPipeName: "subscriptions_backfill",
		datasource: "subscriptions",
		startEpochMs: 1744118448491,
	},
	{
		label: "features",
		copyPipeName: "features_backfill",
		datasource: "features",
		startEpochMs: 1737570301197,
	},
	{
		label: "prices",
		copyPipeName: "prices_backfill",
		datasource: "prices",
		startEpochMs: 1737570713388,
	},
	{
		label: "products",
		copyPipeName: "products_backfill",
		datasource: "products",
		startEpochMs: 1737570326143,
	},
];

interface Args {
	chunkDays: number;
	dryRun: boolean;
	all: boolean;
}

function parseArgs(): Args {
	const args: Args = {
		chunkDays: DEFAULT_CHUNK_DAYS,
		dryRun: false,
		all: false,
	};

	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === "--chunk-days" && process.argv[i + 1]) {
			args.chunkDays = parseInt(process.argv[++i], 10);
		} else if (arg === "--dry-run") {
			args.dryRun = true;
		} else if (arg === "--all") {
			args.all = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
Interactive Tinybird backfill CLI

Usage: bun scripts/backfill_cli.ts [options]

Options:
  --chunk-days <n>   Days per chunk (default: ${DEFAULT_CHUNK_DAYS})
  --dry-run          Show chunks without executing copy jobs
  --all              Skip prompt, backfill all tables
  --help, -h         Show this help message

Available tables:
${TABLE_CONFIGS.map((t, i) => `  ${i + 1}. ${t.label}`).join("\n")}

Note: rollovers uses cursor-based pagination — run separately:
  bun scripts/backfill_rollovers.ts
`);
			process.exit(0);
		}
	}

	return args;
}

async function multiSelect({
	items,
	prompt,
}: {
	items: string[];
	prompt: string;
}): Promise<number[]> {
	const selected = new Set<number>();

	items.forEach((_, i) => selected.add(i));

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const KEYS = "123456789bcdefghijklmopqrstuvwxyz";

	const keyForIndex = (i: number) => KEYS[i] ?? "?";

	const renderMenu = () => {
		console.clear();
		console.log(prompt);
		console.log("(key to toggle, A to select all, N to select none, Enter to confirm)\n");
		items.forEach((item, i) => {
			const checked = selected.has(i) ? "[x]" : "[ ]";
			console.log(`  ${checked} ${keyForIndex(i)}. ${item}`);
		});
		console.log("");
	};

	return new Promise((resolve) => {
		renderMenu();

		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}

		const onKeypress = (chunk: Buffer) => {
			const key = chunk.toString().toLowerCase();

			if (key === "\r" || key === "\n") {
				process.stdin.removeListener("data", onKeypress);
				if (process.stdin.isTTY) {
					process.stdin.setRawMode(false);
				}
				rl.close();
				console.clear();
				resolve([...selected].sort((a, b) => a - b));
				return;
			}

			if (key === "a") {
				items.forEach((_, i) => selected.add(i));
				renderMenu();
				return;
			}

			if (key === "n") {
				selected.clear();
				renderMenu();
				return;
			}

			if (key === "\x03") {
				process.exit(0);
			}

			const idx = KEYS.indexOf(key);
			if (idx !== -1 && idx < items.length) {
				if (selected.has(idx)) {
					selected.delete(idx);
				} else {
					selected.add(idx);
				}
				renderMenu();
				return;
			}
		};

		process.stdin.on("data", onKeypress);
	});
}

async function main() {
	const args = parseArgs();

	let selectedConfigs: TableConfig[];

	if (args.all) {
		selectedConfigs = TABLE_CONFIGS;
		console.log("--all flag set: backfilling all tables.\n");
	} else {
		const selectedIndices = await multiSelect({
			items: TABLE_CONFIGS.map((t) => t.label),
			prompt: "Select tables to backfill:",
		});

		if (selectedIndices.length === 0) {
			console.log("No tables selected. Exiting.");
			process.exit(0);
		}

		selectedConfigs = selectedIndices.map((i) => TABLE_CONFIGS[i]);
	}

	console.log(`\nBackfilling ${selectedConfigs.length} table(s): ${selectedConfigs.map((t) => t.label).join(", ")}`);
	console.log(`Chunk size: ${args.chunkDays} days`);
	if (args.dryRun) console.log("DRY RUN — no copy jobs will be executed.\n");

	for (const config of selectedConfigs) {
		await runTableBackfill({ config, chunkDays: args.chunkDays, dryRun: args.dryRun });
	}

	console.log("\n==========================================");
	console.log("All selected backfills complete.");
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
