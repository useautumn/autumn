/**
 * A plain `atmn pull` reads webhooks from every env the loaded env files hold
 * a key for: the default sandbox, live, and each named sandbox by its slug,
 * one entry per endpoint per env. A skipped env keeps its entries.
 */

import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RemoteWebhook } from "../../src/actions/pull/webhooks/types";
import { webhookPullEnvs } from "../../src/actions/pull/webhooks/webhookPullEnvs";
import { AutumnApiError } from "../../src/generated/client";

const SRC = join(import.meta.dir, "../../src/generated");

const remote = (id: string, url: string): RemoteWebhook => ({
	id,
	url,
	description: null,
	events: ["billing.updated"],
	disabled: false,
	createdAt: 1,
	updatedAt: 1,
});

const projectWith = ({ webhooks }: { webhooks: string }): string => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-webhooks-pull-envs-"));
	writeFileSync(
		join(dir, "autumn.config.ts"),
		`import { atmn } from ${JSON.stringify(join(SRC, "wire"))};
import { webhook } from ${JSON.stringify(join(SRC, "webhooks"))};

export default atmn({
	features: [],
${webhooks}
});
`,
	);
	return dir;
};

const catalogClient = {
	diff: async () => ({ features: [], plans: [] }),
	get: async () => ({ features: [], plans: [] }),
	previewUpdateOrganization: async () => ({ config: { changes: [] } }),
};

const rejected = () =>
	new AutumnApiError({
		status: 401,
		body: { message: "Invalid secret key" },
		path: "/v1/webhooks.list",
	});

/** Each key lists its own env's webhooks; a key mapped to an error throws it. */
const pullWith = async ({
	dir,
	env,
	lists,
}: {
	dir: string;
	env: Record<string, string>;
	lists: Record<string, RemoteWebhook[] | Error>;
}) => {
	const { runPull } = await import("../../src/actions/pull");
	const listed: string[] = [];
	const orgLookups: string[] = [];
	let output = "";
	await runPull({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: catalogClient as any,
		cwd: dir,
		write: (text) => {
			output += text;
		},
		webhookEnvs: () =>
			webhookPullEnvs({
				env,
				listWebhooks: async ({ secretKey }) => {
					listed.push(secretKey);
					const list = lists[secretKey];
					if (list instanceof Error) throw list;
					return { list: list ?? [] };
				},
				targetKeyName: "AUTUMN_SECRET_KEY",
				fetchOrgInfo: async ({ secretKey }) => {
					orgLookups.push(secretKey);
					if (secretKey === "sk_qa")
						return {
							id: "org_qa",
							name: "QA Team",
							slug: "qa-team",
							env: "sandbox",
							is_sandbox: true,
							created_by: "org_main",
						};
					return {
						id: secretKey === "sk_foreign" ? "org_other" : "org_main",
						name: "Acme",
						slug: "acme",
						env: secretKey === "sk_sandbox" ? "sandbox" : "live",
					};
				},
			}),
	});
	return {
		output,
		listed,
		orgLookups,
		source: readFileSync(join(dir, "autumn.config.ts"), "utf8"),
	};
};

const entries = (source: string) =>
	[...source.matchAll(/env: "([^"]+)",\s*url: "([^"]+)"/g)].map(
		([, env, url]) => [env, url],
	);

test("three keys: one pull writes one entry per env, keyed by live, sandbox and the named sandbox's slug", async () => {
	const dir = projectWith({
		webhooks: `	webhooks: [
		webhook({
			id: "billing",
			env: "sandbox",
			url: "https://staging.example.com/autumn",
			events: ["billing.updated"],
		}),
	],`,
	});
	const { source, listed } = await pullWith({
		dir,
		env: {
			AUTUMN_SECRET_KEY: "sk_sandbox",
			AUTUMN_PROD_SECRET_KEY: "sk_live",
			AUTUMN_SANDBOX_QA_TEAM_SECRET_KEY: "sk_qa",
		},
		lists: {
			sk_sandbox: [remote("billing", "https://staging.example.com/autumn")],
			sk_live: [remote("billing", "https://example.com/autumn")],
			sk_qa: [remote("billing", "https://qa.example.com/autumn")],
		},
	});
	expect(listed.sort()).toEqual(["sk_live", "sk_qa", "sk_sandbox"]);
	expect(entries(source).sort()).toEqual([
		["live", "https://example.com/autumn"],
		["qa-team", "https://qa.example.com/autumn"],
		["sandbox", "https://staging.example.com/autumn"],
	]);
});

test("two envs sharing a URL pull as two entries, dashboard endpoints under their own ep_ ids", async () => {
	const dir = projectWith({ webhooks: "" });
	const dashboard = (id: string) => remote(id, "https://example.com/autumn");
	const { source } = await pullWith({
		dir,
		env: { AUTUMN_SECRET_KEY: "sk_sandbox", AUTUMN_PROD_SECRET_KEY: "sk_live" },
		lists: {
			sk_sandbox: [dashboard("ep_2Qx7c9LmNpRsTuVwXyZa1b3d4e5")],
			sk_live: [dashboard("ep_9Zy8x7WvUtSrQpOnMlKj6h5g4f3")],
		},
	});
	expect(source.match(/webhook\(\{/g)?.length).toBe(2);
	expect(source).toContain(
		`id: "ep_2Qx7c9LmNpRsTuVwXyZa1b3d4e5",\n\t\t\tenv: "sandbox"`,
	);
	expect(source).toContain(
		`id: "ep_9Zy8x7WvUtSrQpOnMlKj6h5g4f3",\n\t\t\tenv: "live"`,
	);
});

test("a rejected prod key warns, the other envs still pull, and the config's live entries stay", async () => {
	const dir = projectWith({
		webhooks: `	webhooks: [
		webhook({ id: "billing", env: "sandbox", url: "https://old.example.com/autumn" }),
		webhook({ id: "billing", env: "live", url: "https://example.com/autumn" }),
	],`,
	});
	const { source, output } = await pullWith({
		dir,
		env: {
			AUTUMN_SECRET_KEY: "sk_sandbox",
			AUTUMN_PROD_SECRET_KEY: "sk_live",
		},
		lists: {
			sk_sandbox: [remote("billing", "https://new.example.com/autumn")],
			sk_live: rejected(),
		},
	});
	expect(output).toContain(
		"⚠ webhooks: skipped live (AUTUMN_PROD_SECRET_KEY was rejected)",
	);
	expect(source).toContain(
		`env: "sandbox", url: "https://new.example.com/autumn"`,
	);
	expect(source).toContain(`env: "live", url: "https://example.com/autumn"`);
});

test("a named sandbox whose webhooks list 404s warns, the pull succeeds, and its entries stay", async () => {
	const dir = projectWith({
		webhooks: `	webhooks: [
		webhook({ id: "billing", env: "qa-team", url: "https://qa.example.com/autumn" }),
	],`,
	});
	const { source, output } = await pullWith({
		dir,
		env: {
			AUTUMN_SECRET_KEY: "sk_sandbox",
			AUTUMN_SANDBOX_QA_TEAM_SECRET_KEY: "sk_qa",
		},
		lists: {
			sk_sandbox: [],
			sk_qa: new AutumnApiError({
				status: 404,
				body: { message: "Webhooks not found" },
				path: "/v1/webhooks.list",
			}),
		},
	});
	expect(output).toContain(
		"⚠ webhooks: skipped sandbox qa_team (AUTUMN_SANDBOX_QA_TEAM_SECRET_KEY failed: Webhooks not found)",
	);
	expect(source).toContain(
		`env: "qa-team", url: "https://qa.example.com/autumn"`,
	);
});

test("a throttled env (429) fails the pull rather than being skipped", async () => {
	const dir = projectWith({ webhooks: "" });
	const throttled = new AutumnApiError({
		status: 429,
		body: { message: "Too many requests" },
		path: "/v1/webhooks.list",
	});
	await expect(
		pullWith({
			dir,
			env: {
				AUTUMN_SECRET_KEY: "sk_sandbox",
				AUTUMN_PROD_SECRET_KEY: "sk_live",
			},
			lists: { sk_sandbox: [], sk_live: throttled },
		}),
	).rejects.toThrow("Too many requests");
});

test("only the default key: reads the default sandbox alone and leaves live entries", async () => {
	const dir = projectWith({
		webhooks: `	webhooks: [
		webhook({ id: "billing", env: "sandbox", url: "https://old.example.com/autumn" }),
		webhook({ id: "billing", env: "live", url: "https://example.com/autumn" }),
	],`,
	});
	const { source, listed, output, orgLookups } = await pullWith({
		dir,
		env: { AUTUMN_SECRET_KEY: "sk_sandbox" },
		lists: {
			sk_sandbox: [remote("billing", "https://new.example.com/autumn")],
		},
	});
	expect(listed).toEqual(["sk_sandbox"]);
	expect(orgLookups).toEqual([]);
	expect(output).not.toContain("skipped");
	expect(source).toContain(
		`env: "sandbox", url: "https://new.example.com/autumn"`,
	);
	expect(source).toContain(`env: "live", url: "https://example.com/autumn"`);
});

test("a prod key for another org is skipped with a warning, and its webhooks never land in live", async () => {
	const dir = projectWith({ webhooks: "" });
	const { source, output } = await pullWith({
		dir,
		env: {
			AUTUMN_SECRET_KEY: "sk_sandbox",
			AUTUMN_PROD_SECRET_KEY: "sk_foreign",
		},
		lists: {
			sk_sandbox: [],
			sk_foreign: [remote("other", "https://other.example.com/hook")],
		},
	});
	expect(output).toContain(
		"⚠ webhooks: skipped live (AUTUMN_PROD_SECRET_KEY belongs to another org)",
	);
	expect(source).not.toContain("other.example.com");
});
