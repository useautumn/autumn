/**
 * Push's waterfall: settings, catalog and webhooks preview together and render
 * as one; with --yes, settings → catalog runs as a chain while webhooks sync
 * and save their secrets alongside it. Every failing lane is reported at once.
 */

import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pushExitCode, runPush } from "../../src/actions/push";
import type { WebhookEnv } from "../../src/actions/webhooks/types/webhookEnv";

const SRC = join(import.meta.dir, "../../src/generated");

/** Outside the repo, so a saved secret can never land in a real env file. */
const projectWith = ({ body }: { body: string }): string => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-webhooks-push-"));
	writeFileSync(
		join(dir, "autumn.config.ts"),
		[
			`import { atmn } from ${JSON.stringify(join(SRC, "wire"))};`,
			`import { webhook } from ${JSON.stringify(join(SRC, "webhooks"))};`,
			"",
			"export default atmn({",
			body,
			"});",
			"",
		].join("\n"),
	);
	return dir;
};

const WEBHOOKS = `	webhooks: [
		webhook({
			id: "billing",
			events: ["billing.updated"],
			url: { sandbox: "https://staging.example.com/autumn" },
		}),
		webhook({
			id: "audit",
			events: ["billing.updated"],
			url: { live: "https://example.com/audit" },
		}),
	],`;

const SANDBOX: WebhookEnv = {
	key: "sandbox",
	live: false,
	orgId: async () => "org_ab12cd34",
};

const state = (url: string) => ({
	id: "billing",
	url,
	description: null,
	events: ["billing.updated" as const],
	disabled: false,
	createdAt: 1,
	updatedAt: 1,
});

/** Resolves once every name in `names` has been started; rejects if one never is. */
const barrier = ({ names }: { names: string[] }) => {
	const started = new Set<string>();
	let release: () => void = () => {};
	const all = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		arrive: async (name: string) => {
			started.add(name);
			if (names.every((each) => started.has(each))) release();
			await Promise.race([
				all,
				new Promise((_, reject) =>
					setTimeout(
						() =>
							reject(
								new Error(`${name} waited alone: ${[...started].join(", ")}`),
							),
						500,
					),
				),
			]);
		},
	};
};

const catalogWithWork = {
	features: [{ action: "create", featureId: "messages", name: "Messages" }],
	plans: [],
};

test("the three previews run together and render as one preview", async () => {
	const dir = projectWith({
		body: `\tfeatures: [],\n\tsettings: { multiCurrency: true },\n${WEBHOOKS}`,
	});
	const previews = barrier({
		names: [
			"previewUpdateOrganization",
			"previewUpdate",
			"previewSyncWebhooks",
		],
	});
	let sent: unknown;
	const client = {
		previewUpdateOrganization: async () => {
			await previews.arrive("previewUpdateOrganization");
			return {
				config: {
					changes: [
						{
							key: "multi_currency",
							action: "update",
							previous: false,
							current: true,
						},
					],
				},
			};
		},
		previewUpdate: async () => {
			await previews.arrive("previewUpdate");
			return catalogWithWork;
		},
		previewSyncWebhooks: async (body: unknown) => {
			sent = body;
			await previews.arrive("previewSyncWebhooks");
			return {
				changes: [
					{
						action: "update",
						id: "billing",
						before: state("https://old.example.com/autumn"),
						after: state("https://staging.example.com/autumn"),
					},
				],
			};
		},
	};
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		dryRun: true,
		write: (text) => {
			output += text;
		},
		webhookEnv: async () => SANDBOX,
	});

	expect(sent).toEqual({
		webhooks: [
			{
				id: "billing",
				url: "https://staging.example.com/autumn",
				events: ["billing.updated"],
			},
		],
	});
	expect(output).toContain("Settings (1)");
	expect(output).toContain("Features (1)");
	expect(output).toContain("Webhooks (1)");
	expect(output).toContain(
		"billing url: https://old.example.com/autumn → https://staging.example.com/autumn",
	);
	expect(output).toContain("audit  skipped (no url for sandbox)");
});

test("--yes: settings apply before the catalog, and webhooks sync alongside, saving their secret", async () => {
	const dir = projectWith({
		body: `\tfeatures: [],\n\tsettings: { multiCurrency: true },\n${WEBHOOKS}`,
	});
	const order: string[] = [];
	// The catalog write waits for the webhook sync to have started: were
	// webhooks queued behind the catalog chain, this would never release.
	const alongside = barrier({ names: ["update", "syncWebhooks"] });
	const client = {
		previewUpdateOrganization: async () => ({
			config: {
				changes: [
					{
						key: "multi_currency",
						action: "update",
						previous: false,
						current: true,
					},
				],
			},
		}),
		updateOrganization: async () => {
			order.push("updateOrganization");
			return { config: {} };
		},
		previewUpdate: async () => {
			order.push("previewUpdate");
			return catalogWithWork;
		},
		update: async () => {
			order.push("update");
			await alongside.arrive("update");
			return { results: {}, migrations: [] };
		},
		previewSyncWebhooks: async () => ({
			changes: [
				{
					action: "create",
					id: "billing",
					webhook: state("https://staging.example.com/autumn"),
				},
			],
		}),
		syncWebhooks: async () => {
			order.push("syncWebhooks");
			await alongside.arrive("syncWebhooks");
			return {
				webhooks: [],
				secrets: [{ id: "billing", secret: "whsec_test" }],
				errors: [],
			};
		},
	};
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: (text) => {
			output += text;
		},
		webhookEnv: async () => SANDBOX,
	});

	const catalogChain = order.filter((call) => call !== "syncWebhooks");
	expect(catalogChain).toEqual([
		"previewUpdate",
		"updateOrganization",
		"previewUpdate",
		"update",
	]);
	expect(order.indexOf("syncWebhooks")).toBeLessThan(order.indexOf("update"));
	expect(readFileSync(join(dir, ".env"), "utf8")).toContain(
		"AUTUMN_WEBHOOK_BILLING_AB12_SECRET=whsec_test",
	);
	expect(output).toContain(
		"Saved webhook secret as AUTUMN_WEBHOOK_BILLING_AB12_SECRET in .env",
	);
});

test("every failing preview lane is reported in one error", async () => {
	const dir = projectWith({
		body: `\tfeatures: [],\n\tsettings: { multiCurrency: true },\n${WEBHOOKS}`,
	});
	const client = {
		previewUpdateOrganization: async () => ({ config: { changes: [] } }),
		previewUpdate: async () => {
			throw new Error("plan pro: price must be positive");
		},
		previewSyncWebhooks: async () => {
			throw new Error("billing: Webhook URL must use https.");
		},
	};
	const push = runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: () => {},
		webhookEnv: async () => SANDBOX,
	});
	await expect(push).rejects.toThrow(
		[
			"push preview failed in 2 of its lanes:",
			"",
			"  catalog",
			"    plan pro: price must be positive",
			"",
			"  webhooks",
			"    billing: Webhook URL must use https.",
		].join("\n"),
	);
});

/** A EUR price is refused until multi_currency is on, as the server does. */
const multiCurrencyClient = ({ stillFails = false } = {}) => {
	const order: string[] = [];
	let multiCurrency = false;
	return {
		order,
		client: {
			previewUpdateOrganization: async () => {
				order.push("previewUpdateOrganization");
				return {
					config: {
						changes: [
							{
								key: "multi_currency",
								action: "update",
								previous: false,
								current: true,
							},
						],
					},
				};
			},
			updateOrganization: async () => {
				order.push("updateOrganization");
				multiCurrency = true;
				return { config: {} };
			},
			previewUpdate: async () => {
				order.push("previewUpdate");
				if (!multiCurrency || stillFails)
					throw new Error("plan pro: EUR prices need multi-currency enabled");
				return catalogWithWork;
			},
			update: async () => {
				order.push("update");
				return { results: {}, migrations: [] };
			},
		},
	};
};

const MULTI_CURRENCY = `\tfeatures: [],\n\tsettings: { multiCurrency: true },`;

test("multiCurrency + a EUR price: the catalog preview waits for settings instead of failing the push", async () => {
	const dryDir = projectWith({ body: MULTI_CURRENCY });
	const dry = multiCurrencyClient();
	let dryOutput = "";
	const dryResult = await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: dry.client as any,
		cwd: dryDir,
		dryRun: true,
		write: (text) => {
			dryOutput += text;
		},
	});
	expect(pushExitCode({ apply: false, result: dryResult })).toBe(1);
	expect(dry.order).not.toContain("updateOrganization");
	expect(dryOutput).toContain("Settings (1)");
	expect(dryOutput).toContain(
		"Catalog: not previewed yet. It depends on the settings above",
	);
	expect(dryOutput).toContain("EUR prices need multi-currency enabled");

	const applyDir = projectWith({ body: MULTI_CURRENCY });
	const applied = multiCurrencyClient();
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: applied.client as any,
		cwd: applyDir,
		write: (text) => {
			output += text;
		},
	});
	expect(
		applied.order.filter((call) => call !== "previewUpdateOrganization"),
	).toEqual(["previewUpdate", "updateOrganization", "previewUpdate", "update"]);
	// The catalog was never shown before: its re-preview is printed before it applies.
	expect(output.indexOf("Features (1)")).toBeGreaterThan(
		output.indexOf("Applied settings."),
	);
});

test("a catalog that still fails after settings apply surfaces its error", async () => {
	const dir = projectWith({ body: MULTI_CURRENCY });
	const { client } = multiCurrencyClient({ stillFails: true });
	const push = runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: () => {},
	});
	await expect(push).rejects.toThrow("EUR prices need multi-currency enabled");
});
