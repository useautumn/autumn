#!/usr/bin/env bun
/**
 * Probe every Stripe key in STRIPE_TEST_KEY_POOL (+ STRIPE_SANDBOX_SECRET_KEY):
 * for each, fetch the platform account's id + display name and test whether
 * `v2.core.accounts.list` works (the gate the swarm needs to create sub-accounts).
 * Prints a table + a usable count.
 *
 * Run:
 *   ENV_FILE=.env infisical run --env=dev --recursive -- \
 *     bun scripts/tw/probe-stripe-keys.ts
 */
import { stripeClientForKey } from "./helpers/stripeKeyPool.ts";

// Stripe's v2 `list()` leaves a dangling internal auto-pager promise that rejects
// on a 404 ("API method cannot be found") even though we already await + catch the
// result. Swallow it so the diagnostic exits clean.
process.on("unhandledRejection", () => {
	/* probe already records the per-key outcome */
});

type KeyRef = { key: string; label: string };

const collectKeys = (): KeyRef[] => {
	const refs: KeyRef[] = [];
	const pool =
		process.env.STRIPE_TEST_KEY_POOL?.split(",")
			.map((k) => k.trim())
			.filter(Boolean) ?? [];
	pool.forEach((key, index) => refs.push({ key, label: `pool[${index}]` }));
	const single = process.env.STRIPE_SANDBOX_SECRET_KEY?.trim();
	if (single && !pool.includes(single)) {
		refs.push({ key: single, label: "SANDBOX" });
	}
	return refs;
};

type Row = {
	label: string;
	prefix: string;
	accountId: string;
	name: string;
	v2: string;
	error: string;
};

const truncate = (text: string, max: number): string =>
	text.length > max ? `${text.slice(0, max - 1)}…` : text;

const probe = async ({ key, label }: KeyRef): Promise<Row> => {
	const stripe = stripeClientForKey(key);

	let accountId = "—";
	let name = "—";
	try {
		// No-arg retrieve → GET /v1/account: the account this key belongs to.
		const account = await stripe.accounts.retrieve();
		accountId = account.id;
		name =
			account.settings?.dashboard?.display_name ||
			account.business_profile?.name ||
			account.email ||
			"(unnamed)";
	} catch (error) {
		name = `account.retrieve failed: ${(error as Error).message}`;
	}

	let v2 = "ok";
	let error = "";
	try {
		await stripe.v2.core.accounts.list({ limit: 1 });
	} catch (e) {
		v2 = "FAIL";
		error = (e as Error).message;
	}

	return {
		label,
		prefix: `${key.slice(0, 16)}…`,
		accountId,
		name: truncate(name, 48),
		v2,
		error: truncate(error, 70),
	};
};

const main = async (): Promise<void> => {
	const keys = collectKeys();
	if (keys.length === 0) {
		console.error(
			"No keys found — set STRIPE_TEST_KEY_POOL (comma-separated) and/or STRIPE_SANDBOX_SECRET_KEY",
		);
		process.exit(1);
	}

	const rows = await Promise.all(keys.map(probe));

	const cols: { header: string; get: (row: Row) => string }[] = [
		{ header: "key", get: (row) => `${row.label} ${row.prefix}` },
		{ header: "account id", get: (row) => row.accountId },
		{ header: "account name", get: (row) => row.name },
		{ header: "v2.list", get: (row) => row.v2 },
		{ header: "error", get: (row) => row.error },
	];
	const widths = cols.map((col) =>
		Math.max(col.header.length, ...rows.map((row) => col.get(row).length)),
	);
	const renderRow = (cells: string[]): string =>
		cells.map((cell, i) => cell.padEnd(widths[i])).join("  ");

	console.log(`\n${renderRow(cols.map((col) => col.header))}`);
	console.log(renderRow(widths.map((width) => "-".repeat(width))));
	for (const row of rows) {
		console.log(renderRow(cols.map((col) => col.get(row))));
	}

	const usable = rows.filter((row) => row.v2 === "ok").length;
	console.log(
		`\n${usable}/${rows.length} keys usable for v2.core.accounts (Connect / v2 Accounts API enabled)`,
	);
};

await main();
process.exit(0);
