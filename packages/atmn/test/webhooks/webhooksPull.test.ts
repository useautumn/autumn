/**
 * Pull writes one env's webhooks back into the config. It touches only
 * `url[envKey]` on a url map, and every other key, comment, trailing comma and
 * order stays. The five rules: append an unknown webhook; set a string url;
 * leave code alone (warning when it differs); remove the env's key when the
 * server has none, deleting a webhook whose map empties; skip dashboard ones.
 */

import { expect, test } from "bun:test";
import { applyWebhooksPull } from "../../src/actions/pull/webhooks/applyWebhooksPull";
import type {
	RemoteWebhook,
	StatedWebhook,
} from "../../src/actions/pull/webhooks/types";

const CONFIG = "/project/autumn.config.ts";

const remote = (
	id: string,
	url: string,
	overrides: Partial<RemoteWebhook> = {},
): RemoteWebhook => ({
	id,
	url,
	description: null,
	events: ["billing.updated"],
	disabled: false,
	createdAt: 1,
	updatedAt: 1,
	...overrides,
});

const pullInto = ({
	source,
	files = {},
	remoteList,
	stated,
	envKey = "sandbox",
}: {
	source: string;
	files?: Record<string, string>;
	remoteList: RemoteWebhook[];
	stated?: StatedWebhook[];
	envKey?: string;
}) => {
	const map = new Map([[CONFIG, source], ...Object.entries(files)]);
	const result = applyWebhooksPull({
		pull: { configPath: CONFIG, files: map },
		remote: remoteList,
		stated,
		envKey,
	});
	return { ...result, source: map.get(CONFIG), files: map };
};

test("rule 1: a remote webhook the config never names is appended with this env's url only", () => {
	const { source, lines } = pullInto({
		source: `import { atmn } from "atmn";

export default atmn({
	features: [],
});
`,
		remoteList: [
			remote("billing", "https://staging.example.com/autumn", {
				description: "Plan changes",
			}),
		],
	});
	expect(source).toBe(`import { webhook, atmn } from "atmn";

export default atmn({
	features: [],
	webhooks: [
		webhook({
			id: "billing",
			url: {
				sandbox: "https://staging.example.com/autumn",
			},
			events: [
				"billing.updated",
			],
			description: "Plan changes",
		}),
	],
});
`);
	expect(lines).toEqual(["+ webhook billing"]);
});

test("rule 2: a string url is set or replaced for this env only; other keys, comments and fields follow the server", () => {
	const before = `export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			events: ["billing.updated"],
			url: {
				live: "https://example.com/autumn", // prod
			},
		}),
		webhook({
			id: "invoices",
			events: ["invoice.finalized"],
			url: {
				sandbox: "https://old.example.com/invoices", // staging box
				live: "https://example.com/invoices",
			},
		}),
	],
});
`;
	const { source, lines } = pullInto({
		source: before,
		remoteList: [
			remote("billing", "https://staging.example.com/autumn", {
				events: ["billing.updated", "balances.limit_reached"],
			}),
			remote("invoices", "https://new.example.com/invoices", {
				events: ["invoice.finalized"],
			}),
		],
		stated: [
			{
				id: "billing",
				events: ["billing.updated"],
				url: { live: "https://example.com/autumn" },
			},
			{
				id: "invoices",
				events: ["invoice.finalized"],
				url: {
					sandbox: "https://old.example.com/invoices",
					live: "https://example.com/invoices",
				},
			},
		],
	});
	expect(source).toBe(`export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			events: ["billing.updated", "balances.limit_reached"],
			url: {
				live: "https://example.com/autumn", // prod
				sandbox: "https://staging.example.com/autumn",
			},
		}),
		webhook({
			id: "invoices",
			events: ["invoice.finalized"],
			url: {
				sandbox: "https://new.example.com/invoices", // staging box
				live: "https://example.com/invoices",
			},
		}),
	],
});
`);
	expect(lines).toEqual(["~ webhook billing", "~ webhook invoices"]);
});

test("rule 3: a url that is code is never rewritten, and differs only earn a warning", () => {
	const before = `export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			events: ["billing.updated"],
			url: { sandbox: process.env.STAGING_URL },
		}),
	],
});
`;
	const differs = pullInto({
		source: before,
		remoteList: [remote("billing", "https://staging.myapp.com/api/autumn")],
		stated: [
			{
				id: "billing",
				events: ["billing.updated"],
				url: { sandbox: "https://sandbox.myapp.com/api/autumn" },
			},
		],
	});
	expect(differs.source).toBe(before);
	expect(differs.warnings).toEqual([
		[
			"⚠ billing  url.sandbox isn't a plain string, so pull left it untouched",
			"           server:      https://staging.myapp.com/api/autumn",
			"           your config: https://sandbox.myapp.com/api/autumn",
			"           Update it by hand, or make it a string and pull will manage it.",
		].join("\n"),
	]);
	const same = pullInto({
		source: before,
		remoteList: [remote("billing", "https://staging.myapp.com/api/autumn")],
		stated: [
			{
				id: "billing",
				events: ["billing.updated"],
				url: { sandbox: "https://staging.myapp.com/api/autumn" },
			},
		],
	});
	expect(same.warnings).toEqual([]);
});

test("rule 4: no server webhook in this env removes the env's key, and an emptied map removes the webhook and its export", () => {
	const hooks = "/project/webhooks.ts";
	const { source, files, lines } = pullInto({
		source: `import { audit } from "./webhooks";

export default atmn({
	webhooks: [
		audit,
		webhook({
			id: "billing",
			events: ["billing.updated"],
			url: {
				live: "https://example.com/autumn", // prod
				sandbox: "https://staging.example.com/autumn",
			},
		}),
	],
});
`,
		files: {
			[hooks]: `export const audit = webhook({
	id: "audit",
	events: ["billing.updated"],
	url: { sandbox: "https://staging.example.com/audit" },
});
`,
		},
		remoteList: [],
		stated: [
			{
				id: "audit",
				events: ["billing.updated"],
				url: { sandbox: "https://staging.example.com/audit" },
			},
			{
				id: "billing",
				events: ["billing.updated"],
				url: {
					live: "https://example.com/autumn",
					sandbox: "https://staging.example.com/autumn",
				},
			},
		],
	});
	expect(source).toBe(`export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			events: ["billing.updated"],
			url: {
				live: "https://example.com/autumn", // prod
			},
		}),
	],
});
`);
	expect(files.get(hooks)).toBe("");
	expect(lines).toEqual(["- webhook audit", "- webhook billing url.sandbox"]);
});

test("rule 5: a dashboard webhook is skipped with one line, and a webhook with no key for this env is left alone", () => {
	const before = `export default atmn({
	webhooks: [
		webhook({ id: "billing", events: ["billing.updated"], url: { live: "https://example.com/a" } }),
	],
});
`;
	const { source, lines } = pullInto({
		source: before,
		remoteList: [remote("ep_2Qx7c9LmNpRsTuVwXyZa1b3d4e5", "https://x.dev/h")],
		stated: [
			{
				id: "billing",
				events: ["billing.updated"],
				url: { live: "https://example.com/a" },
			},
		],
	});
	expect(source).toBe(before);
	expect(lines).toEqual([
		"· webhook ep_2Qx7c9LmNpRsTuVwXyZa1b3d4e5 was made in the dashboard; your config doesn't manage it",
	]);
});

test("runPull lists webhooks in the same parallel batch and prints the code-url warning", async () => {
	const { mkdtempSync, writeFileSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const { runPull } = await import("../../src/actions/pull");
	const src = join(import.meta.dir, "../../src/generated");
	const dir = mkdtempSync(join(tmpdir(), "atmn-webhooks-pull-"));
	process.env.ATMN_TEST_STAGING_URL = "https://sandbox.myapp.com/api/autumn";
	writeFileSync(
		join(dir, "autumn.config.ts"),
		`import { atmn } from ${JSON.stringify(join(src, "wire"))};
import { webhook } from ${JSON.stringify(join(src, "webhooks"))};

export default atmn({
	features: [],
	webhooks: [
		webhook({
			id: "billing",
			events: ["billing.updated"],
			url: { sandbox: process.env.ATMN_TEST_STAGING_URL },
		}),
	],
});
`,
	);
	const started: string[] = [];
	let release: () => void = () => {};
	const allStarted = new Promise<void>((resolve) => {
		release = resolve;
	});
	const arrive = async <T>(name: string, value: T): Promise<T> => {
		started.push(name);
		if (started.length === 4) release();
		await Promise.race([
			allStarted,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error(`${name} waited alone`)), 500),
			),
		]);
		return value;
	};
	const client = {
		diff: () => arrive("diff", { features: [], plans: [] }),
		get: () => arrive("get", { features: [], plans: [] }),
		previewUpdateOrganization: () =>
			arrive("previewUpdateOrganization", { config: { changes: [] } }),
		listWebhooks: () =>
			arrive("listWebhooks", {
				list: [remote("billing", "https://staging.myapp.com/api/autumn")],
			}),
	};
	let output = "";
	await runPull({
		// biome-ignore lint/suspicious/noExplicitAny: a fake client
		client: client as any,
		cwd: dir,
		write: (text) => {
			output += text;
		},
		webhookEnv: async () => ({
			key: "sandbox",
			live: false,
			orgId: async () => "org_ab12",
		}),
	});
	expect(started.sort()).toEqual([
		"diff",
		"get",
		"listWebhooks",
		"previewUpdateOrganization",
	]);
	expect(output).toContain("your config: https://sandbox.myapp.com/api/autumn");
});

test("a config id shaped like a Svix endpoint id is still the config's", () => {
	const id = "ep_2Qx7c9LmNpRsTuVwXyZa1b3d4e5";
	const before = `export default atmn({
	webhooks: [
		webhook({ id: "${id}", events: ["billing.updated"], url: { sandbox: "https://x.dev/h" } }),
	],
});
`;
	const { source, lines } = pullInto({
		source: before,
		remoteList: [remote(id, "https://x.dev/h")],
		stated: [
			{ id, events: ["billing.updated"], url: { sandbox: "https://x.dev/h" } },
		],
	});
	expect(source).toBe(before);
	expect(lines).toEqual([]);
});

test("pull never appends webhooks after a root spread, and never deletes a computed webhook half-way", () => {
	const spread = `export default atmn({ ...shared });
`;
	const appended = pullInto({
		source: spread,
		remoteList: [remote("billing", "https://x.dev/h")],
	});
	expect(appended.source).toBe(spread);
	expect(appended.unlocated[0]?.action).toContain("atmn() spreads `shared`");

	const computed = `export default atmn({
	webhooks: [
		webhook({ id: "billing", events: EVENTS, url: { sandbox: "https://x.dev/h" } }),
	],
});
`;
	const removed = pullInto({
		source: computed,
		remoteList: [],
		stated: [
			{
				id: "billing",
				events: ["billing.updated"],
				url: { sandbox: "https://x.dev/h" },
			},
		],
	});
	expect(removed.unlocated).toEqual([
		{
			id: "billing",
			action: "delete the webhook by hand: its url map is now empty",
		},
	]);
});
