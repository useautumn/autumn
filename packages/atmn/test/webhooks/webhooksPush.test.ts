/**
 * Push's waterfall: settings, catalog and webhooks preview together and render
 * as one; with --yes, settings → catalog runs as a chain while webhooks sync
 * and save their secrets alongside it. Every failing lane is reported at once.
 */

import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OrgInfo } from "../../src/actions/env/types/orgInfo";
import { applyWebhooksPull } from "../../src/actions/pull/webhooks/applyWebhooksPull";
import { webhookPullEnvs } from "../../src/actions/pull/webhooks/webhookPullEnvs";
import { pushExitCode, runPush } from "../../src/actions/push";
import type { WebhookClient } from "../../src/actions/webhooks/previewWebhookEnvs";
import { AutumnApiError } from "../../src/generated/client";

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

const orgInfo = ({
	id,
	name = "Acme",
}: {
	id: string;
	name?: string;
}): OrgInfo => ({
	id,
	name,
	slug: name.toLowerCase(),
	env: "sandbox",
	...(id === "org_main" || id === "org_ab12cd34"
		? {}
		: { is_sandbox: true, created_by: "org_ab12cd34" }),
});

/** Each env key reaches its own fake client; an org mapped to an Error throws it. */
const envsWith = ({
	env,
	clients,
	orgs,
	targetKeyName = "AUTUMN_SECRET_KEY",
}: {
	env: Record<string, string>;
	clients: Record<string, unknown>;
	orgs: Record<string, OrgInfo | Error>;
	targetKeyName?: "AUTUMN_SECRET_KEY" | "AUTUMN_PROD_SECRET_KEY";
}) => ({
	webhookEnvs: () =>
		webhookPullEnvs({
			env,
			targetKeyName,
			listWebhooks: async () => ({ list: [] }),
			fetchOrgInfo: async ({ secretKey }) => {
				const info = orgs[secretKey];
				if (info === undefined || info instanceof Error)
					throw info ?? new Error(`no org for ${secretKey}`);
				return info;
			},
		}),
	webhookClientFor: ({ secretKey }: { secretKey: string }) =>
		clients[secretKey] as WebhookClient,
});

/** The default sandbox's key only: the one env a plain push syncs. */
const sandboxOnly = (client: unknown) =>
	envsWith({
		env: { AUTUMN_SECRET_KEY: "sk_sandbox" },
		clients: { sk_sandbox: client },
		orgs: { sk_sandbox: orgInfo({ id: "org_ab12cd34" }) },
	});

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
				errors: [],
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
		...sandboxOnly(client),
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
	expect(output).toContain("Webhooks · sandbox (1)");
	expect(output).toContain(
		"billing url: https://old.example.com/autumn → https://staging.example.com/autumn",
	);
	// A webhook with no url for this env is simply not sent, and never mentioned.
	expect(output).not.toContain("audit");
	expect(output).not.toContain("skipped");
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
			errors: [],
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
		...sandboxOnly(client),
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
		...sandboxOnly(client),
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

test("a deferred catalog that still fails after settings stops the push before webhooks sync", async () => {
	const dir = projectWith({ body: `${MULTI_CURRENCY}\n${WEBHOOKS}` });
	const { order, client } = multiCurrencyClient({ stillFails: true });
	const calls = order;
	const withWebhooks = {
		...client,
		previewSyncWebhooks: async () => ({
			errors: [],
			changes: [
				{
					action: "create",
					id: "billing",
					webhook: state("https://staging.example.com/autumn"),
				},
			],
		}),
		syncWebhooks: async () => {
			calls.push("syncWebhooks");
			return { webhooks: [], secrets: [], errors: [] };
		},
	};
	let output = "";
	let failure: unknown;
	try {
		await runPush({
			// biome-ignore lint/suspicious/noExplicitAny: a fake client
			client: withWebhooks as any,
			cwd: dir,
			write: (text) => {
				output += text;
			},
			...sandboxOnly(withWebhooks),
		});
	} catch (error) {
		failure = error;
	}
	expect(calls).toContain("updateOrganization");
	expect(calls).not.toContain("syncWebhooks");
	expect(calls).not.toContain("update");
	// A rejected runPush is what makes the CLI exit non-zero.
	expect(failure).toBeInstanceOf(Error);
	expect(String((failure as Error).message)).toBe(
		[
			"Applied settings, but the catalog still fails its preview, so the catalog and webhooks were not applied:",
			"  plan pro: EUR prices need multi-currency enabled",
		].join("\n"),
	);
	expect(output).toContain("Applied settings.");
});

const dashboardState = (url: string) => ({
	...state(url),
	id: "ep_2Qx7c9LmNpRsTuVwXyZa1b3d4e5",
});

test("adopt: the preview names it, and applying writes no secret", async () => {
	const dir = projectWith({ body: `\tfeatures: [],\n${WEBHOOKS}` });
	const url = "https://staging.example.com/autumn";
	const client = {
		previewUpdate: async () => ({ features: [], plans: [] }),
		previewSyncWebhooks: async () => ({
			errors: [],
			changes: [
				{
					action: "adopt",
					id: "billing",
					before: dashboardState(url),
					after: state(url),
				},
			],
		}),
		syncWebhooks: async () => ({
			webhooks: [state(url)],
			secrets: [],
			errors: [],
		}),
	};
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: (text) => {
			output += text;
		},
		...sandboxOnly(client),
	});
	expect(output).toContain(
		"~ billing  adopt  existing dashboard webhook · signing secret unchanged",
	);
	expect(output).toContain(
		"Adopted billing (existing dashboard webhook); its signing secret is unchanged, nothing written",
	);
	expect(output).not.toContain("Saved webhook secret");
	expect(existsSync(join(dir, ".env"))).toBe(false);
	expect(existsSync(join(dir, ".env.local"))).toBe(false);
});

test("preview_sync errors fail the push before any write, beside other lanes' errors", async () => {
	const dir = projectWith({ body: `\tfeatures: [],\n${WEBHOOKS}` });
	const calls: string[] = [];
	const client = {
		previewUpdate: async () => {
			throw new Error("plan pro: price must be positive");
		},
		previewSyncWebhooks: async () => ({
			changes: [],
			errors: [
				{
					id: "billing",
					message:
						"2 dashboard webhooks use this URL; delete the extras or give one an id in the dashboard",
				},
			],
		}),
		update: async () => calls.push("update"),
		syncWebhooks: async () => calls.push("syncWebhooks"),
	};
	const push = runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: () => {},
		...sandboxOnly(client),
	});
	await expect(push).rejects.toThrow(
		"  webhooks\n    billing: 2 dashboard webhooks use this URL; delete the extras or give one an id in the dashboard",
	);
	await expect(push).rejects.toThrow(
		"  catalog\n    plan pro: price must be positive",
	);
	expect(calls).toEqual([]);
});

test("a previewed adopt that the server created instead reports the saved secret, not an adoption", async () => {
	const dir = projectWith({ body: `\tfeatures: [],\n${WEBHOOKS}` });
	const url = "https://staging.example.com/autumn";
	const client = {
		previewUpdate: async () => ({ features: [], plans: [] }),
		previewSyncWebhooks: async () => ({
			errors: [],
			changes: [
				{
					action: "adopt",
					id: "billing",
					before: dashboardState(url),
					after: state(url),
				},
			],
		}),
		// The dashboard endpoint moved after the preview, so sync created one.
		syncWebhooks: async () => ({
			webhooks: [state(url)],
			secrets: [{ id: "billing", secret: "whsec_new" }],
			errors: [],
		}),
	};
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: (text) => {
			output += text;
		},
		...sandboxOnly(client),
	});
	expect(output).not.toContain("Adopted billing");
	expect(output).toContain(
		"Saved webhook secret as AUTUMN_WEBHOOK_BILLING_AB12_SECRET in .env",
	);
});

const SHARED_URL = `	webhooks: [
		webhook({
			id: "billing",
			events: ["billing.updated"],
			url: {
				live: "https://example.com/autumn",
				sandbox: "https://sbx.example.com/autumn",
				staging: "https://stg-2.example.com/autumn",
			},
		}),
	],`;

const catalogClean = {
	previewUpdate: async () => ({ features: [], plans: [] }),
};

/** One env's webhooks client: `changes` is its preview, and every call is logged. */
const envClient = ({
	name,
	calls,
	changes = [],
}: {
	name: string;
	calls: string[];
	changes?: unknown[];
}) => ({
	previewSyncWebhooks: async (body: unknown) => {
		calls.push(`${name}:preview ${JSON.stringify(body)}`);
		return { errors: [], changes };
	},
	syncWebhooks: async () => {
		calls.push(`${name}:sync`);
		return { webhooks: [], secrets: [], errors: [] };
	},
});

const THREE_KEYS = {
	AUTUMN_SECRET_KEY: "sk_sandbox",
	AUTUMN_SANDBOX_STG_SECRET_KEY: "sk_stg",
	AUTUMN_PROD_SECRET_KEY: "sk_live",
};

const THREE_ORGS = {
	sk_sandbox: orgInfo({ id: "org_ab12cd34" }),
	sk_stg: orgInfo({ id: "org_stg98765", name: "Staging" }),
	sk_live: orgInfo({ id: "org_ab12cd34" }),
};

const urlUpdate = (before: string, after: string) => ({
	action: "update",
	id: "billing",
	before: state(before),
	after: state(after),
});

test("plain push: a staging-only url change previews and syncs staging, with its own key", async () => {
	const dir = projectWith({ body: `\tfeatures: [],\n${SHARED_URL}` });
	const calls: string[] = [];
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: catalogClean as any,
		cwd: dir,
		write: (text) => {
			output += text;
		},
		...envsWith({
			env: THREE_KEYS,
			orgs: THREE_ORGS,
			clients: {
				sk_sandbox: envClient({ name: "sandbox", calls }),
				sk_stg: envClient({
					name: "staging",
					calls,
					changes: [
						urlUpdate(
							"https://stg.example.com/autumn",
							"https://stg-2.example.com/autumn",
						),
					],
				}),
				sk_live: envClient({ name: "live", calls }),
			},
		}),
	});
	expect(output).toContain("Webhooks · staging (1)");
	expect(output).toContain(
		"billing url: https://stg.example.com/autumn → https://stg-2.example.com/autumn",
	);
	expect(output).not.toContain("No changes");
	expect(calls).toContain(
		`staging:preview ${JSON.stringify({ webhooks: [{ id: "billing", events: ["billing.updated"], url: "https://stg-2.example.com/autumn" }] })}`,
	);
	expect(calls).toContain("staging:sync");
	expect(calls).not.toContain("sandbox:sync");
});

test("plain push with a live diff prints the production hint and never writes live", async () => {
	const dir = projectWith({ body: `\tfeatures: [],\n${SHARED_URL}` });
	const calls: string[] = [];
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: catalogClean as any,
		cwd: dir,
		write: (text) => {
			output += text;
		},
		...envsWith({
			env: THREE_KEYS,
			orgs: THREE_ORGS,
			clients: {
				sk_sandbox: envClient({ name: "sandbox", calls }),
				sk_stg: envClient({ name: "staging", calls }),
				sk_live: envClient({
					name: "live",
					calls,
					changes: [
						urlUpdate(
							"https://old.example.com/autumn",
							"https://example.com/autumn",
						),
					],
				}),
			},
		}),
	});
	expect(output).toContain(
		"Production webhooks differ from your config (billing). Run atmn push -p to update production.",
	);
	expect(output).not.toContain("No changes");
	expect(output).not.toContain("Webhooks · live");
	expect(calls.some((call) => call.startsWith("live:preview"))).toBe(true);
	expect(calls).not.toContain("live:sync");
});

test("-p syncs live only, leaving every sandbox alone", async () => {
	const dir = projectWith({ body: `\tfeatures: [],\n${SHARED_URL}` });
	const calls: string[] = [];
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: catalogClean as any,
		cwd: dir,
		prod: true,
		write: (text) => {
			output += text;
		},
		...envsWith({
			env: THREE_KEYS,
			orgs: THREE_ORGS,
			targetKeyName: "AUTUMN_PROD_SECRET_KEY",
			clients: {
				sk_sandbox: envClient({ name: "sandbox", calls }),
				sk_stg: envClient({ name: "staging", calls }),
				sk_live: envClient({
					name: "live",
					calls,
					changes: [
						urlUpdate(
							"https://old.example.com/autumn",
							"https://example.com/autumn",
						),
					],
				}),
			},
		}),
	});
	expect(output).toContain("Webhooks · live (1)");
	expect(output).not.toContain("Run atmn push -p");
	expect(calls).toContain("live:sync");
	expect(calls.filter((call) => !call.startsWith("live:"))).toEqual([]);
});

test("a rejected sandbox key skips that env with a warning; the others still sync", async () => {
	const dir = projectWith({ body: `\tfeatures: [],\n${SHARED_URL}` });
	const calls: string[] = [];
	let output = "";
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: catalogClean as any,
		cwd: dir,
		write: (text) => {
			output += text;
		},
		...envsWith({
			env: {
				AUTUMN_SECRET_KEY: "sk_sandbox",
				AUTUMN_SANDBOX_STG_SECRET_KEY: "sk_stg",
			},
			orgs: {
				sk_sandbox: orgInfo({ id: "org_ab12cd34" }),
				sk_stg: new AutumnApiError({
					status: 401,
					body: { message: "Invalid secret key" },
					path: "/organization/me",
				}),
			},
			clients: {
				sk_sandbox: envClient({
					name: "sandbox",
					calls,
					changes: [
						urlUpdate(
							"https://old.example.com/autumn",
							"https://sbx.example.com/autumn",
						),
					],
				}),
				sk_stg: envClient({ name: "staging", calls }),
			},
		}),
	});
	expect(output).toContain(
		"⚠ webhooks: skipped sandbox stg (AUTUMN_SANDBOX_STG_SECRET_KEY was rejected)",
	);
	expect(output).toContain("Webhooks · sandbox (1)");
	expect(calls).toContain("sandbox:sync");
	expect(calls.filter((call) => call.startsWith("staging:"))).toEqual([]);
});

test("pull then push of a webhook receiving every event sends no events, so the server keeps it receiving every event", async () => {
	const dir = projectWith({
		body: `\tfeatures: [],\n\twebhooks: [\n\t\twebhook({ id: "billing", events: ["billing.updated"], url: { sandbox: "https://x.dev/h" } }),\n\t],`,
	});
	const configPath = join(dir, "autumn.config.ts");
	const files = new Map([[configPath, readFileSync(configPath, "utf8")]]);
	applyWebhooksPull({
		pull: { configPath, files },
		remote: [{ ...state("https://x.dev/h"), events: [] }],
		stated: [
			{
				id: "billing",
				events: ["billing.updated"],
				url: { sandbox: "https://x.dev/h" },
			},
		],
		envKey: "sandbox",
	});
	writeFileSync(configPath, files.get(configPath) ?? "");

	let sent: unknown;
	const client = {
		previewUpdate: async () => ({ features: [], plans: [] }),
		previewSyncWebhooks: async (body: unknown) => {
			sent = body;
			return { errors: [], changes: [] };
		},
	};
	await runPush({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: () => {},
		...sandboxOnly(client),
	});
	expect(sent).toEqual({
		webhooks: [{ id: "billing", url: "https://x.dev/h" }],
	});
});
