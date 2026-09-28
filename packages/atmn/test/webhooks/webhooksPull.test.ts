/**
 * Pull writes one env's webhooks back into the config, one entry per remote
 * endpoint. An entry is found by `(env, id)`; every other env's entries,
 * comments, trailing commas and order stay. Append an unknown endpoint; set a
 * string url and the other fields; leave code alone (warning when it differs);
 * delete an entry the server no longer has in this env. A dashboard endpoint
 * is written under its own `ep_` id.
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

test("an endpoint the config never names is appended as one entry for this env", () => {
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
			env: "sandbox",
			url: "https://staging.example.com/autumn",
			events: [
				"billing.updated",
			],
			description: "Plan changes",
		}),
	],
});
`);
	expect(lines).toEqual(["+ webhook billing (sandbox)"]);
});

test("a stated entry follows the server in its env only; the same id in another env and comments stay", () => {
	const before = `export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			env: "live",
			events: ["billing.updated"],
			url: "https://example.com/autumn", // prod
		}),
		webhook({
			id: "billing",
			env: "sandbox",
			events: ["billing.updated"],
			url: "https://old.example.com/autumn", // staging box
		}),
	],
});
`;
	const { source, lines } = pullInto({
		source: before,
		remoteList: [
			remote("billing", "https://new.example.com/autumn", {
				events: ["billing.updated", "balances.limit_reached"],
			}),
		],
		stated: [
			{
				id: "billing",
				env: "live",
				events: ["billing.updated"],
				url: "https://example.com/autumn",
			},
			{
				id: "billing",
				env: "sandbox",
				events: ["billing.updated"],
				url: "https://old.example.com/autumn",
			},
		],
	});
	expect(source?.trimStart()).toBe(`export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			env: "live",
			events: ["billing.updated"],
			url: "https://example.com/autumn", // prod
		}),
		webhook({
			id: "billing",
			env: "sandbox",
			events: ["billing.updated", "balances.limit_reached"],
			url: "https://new.example.com/autumn", // staging box
		}),
	],
});
`);
	expect(lines).toEqual(["~ webhook billing (sandbox)"]);
});

test("a url that is code is never rewritten, and a difference only earns a warning", () => {
	const before = `export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			env: "sandbox",
			events: ["billing.updated"],
			url: process.env.STAGING_URL,
		}),
	],
});
`;
	const stated = (url: string): StatedWebhook[] => [
		{ id: "billing", env: "sandbox", events: ["billing.updated"], url },
	];
	const differs = pullInto({
		source: before,
		remoteList: [remote("billing", "https://staging.myapp.com/api/autumn")],
		stated: stated("https://sandbox.myapp.com/api/autumn"),
	});
	expect(differs.source).toBe(before);
	expect(differs.warnings).toEqual([
		[
			"⚠ billing (sandbox)  url isn't a plain string, so pull left it untouched",
			"           server:      https://staging.myapp.com/api/autumn",
			"           your config: https://sandbox.myapp.com/api/autumn",
			"           Update it by hand, or make it a string and pull will manage it.",
		].join("\n"),
	]);
	const same = pullInto({
		source: before,
		remoteList: [remote("billing", "https://staging.myapp.com/api/autumn")],
		stated: stated("https://staging.myapp.com/api/autumn"),
	});
	expect(same.warnings).toEqual([]);
});

test("an entry the server no longer has in this env is deleted with its export; other envs' entries stay", () => {
	const hooks = "/project/webhooks.ts";
	const { source, files, lines } = pullInto({
		source: `import { audit } from "./webhooks";

export default atmn({
	webhooks: [
		audit,
		webhook({
			id: "billing",
			env: "live",
			url: "https://example.com/autumn", // prod
		}),
	],
});
`,
		files: {
			[hooks]: `export const audit = webhook({
	id: "audit",
	env: "sandbox",
	url: "https://staging.example.com/audit",
});
`,
		},
		remoteList: [],
		stated: [
			{
				id: "audit",
				env: "sandbox",
				url: "https://staging.example.com/audit",
			},
			{ id: "billing", env: "live", url: "https://example.com/autumn" },
		],
	});
	expect(source?.trimStart()).toBe(`export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			env: "live",
			url: "https://example.com/autumn", // prod
		}),
	],
});
`);
	expect(files.get(hooks)).toBe("");
	expect(lines).toEqual(["- webhook audit (sandbox)"]);
});

const DASHBOARD_ID = "ep_2Qx7c9LmNpRsTuVwXyZa1b3d4e5";

test("a dashboard endpoint is written under its own ep_ id, and a second pull adds nothing", () => {
	const first = pullInto({
		source: `export default atmn({
	webhooks: [],
});
`,
		remoteList: [remote(DASHBOARD_ID, "https://x.dev/h", { events: [] })],
	});
	expect(first.source).toContain(`id: "${DASHBOARD_ID}"`);
	expect(first.source).not.toContain("events");
	expect(first.lines).toEqual([`+ webhook ${DASHBOARD_ID} (sandbox)`]);

	const second = pullInto({
		source: first.source ?? "",
		remoteList: [remote(DASHBOARD_ID, "https://x.dev/h", { events: [] })],
		stated: [{ id: DASHBOARD_ID, env: "sandbox", url: "https://x.dev/h" }],
	});
	expect(second.source).toBe(first.source);
	expect(second.lines).toEqual([]);
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
			env: "sandbox",
			events: ["billing.updated"],
			url: process.env.ATMN_TEST_STAGING_URL as string,
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
		webhookEnvs: () => [
			{
				keyName: "AUTUMN_SECRET_KEY",
				label: "sandbox",
				secretKey: "sk_sandbox",
				envKey: async () => "sandbox",
				listWebhooks: client.listWebhooks,
			},
		],
	});
	expect(started.sort()).toEqual([
		"diff",
		"get",
		"listWebhooks",
		"previewUpdateOrganization",
	]);
	expect(output).toContain("your config: https://sandbox.myapp.com/api/autumn");
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
		webhook({ id: "billing", env: ENV, url: "https://x.dev/h" }),
	],
});
`;
	const removed = pullInto({
		source: computed,
		remoteList: [],
		stated: [{ id: "billing", env: "sandbox", url: "https://x.dev/h" }],
	});
	expect(removed.source).toBe(computed);
	expect(removed.unlocated).toEqual([
		{ id: "billing", action: "delete the sandbox webhook by hand" },
	]);
});

test("a webhook receiving every event is written with no events key, and pull drops a stated list for it", () => {
	const { source, warnings } = pullInto({
		source: `import { atmn, webhook } from "atmn";

export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			env: "sandbox",
			events: ["billing.updated"],
			url: "https://x.dev/h",
		}),
	],
});
`,
		remoteList: [
			remote("billing", "https://x.dev/h", { events: [] }),
			remote("everything", "https://x.dev/all", { events: [] }),
		],
		stated: [
			{
				id: "billing",
				env: "sandbox",
				events: ["billing.updated"],
				url: "https://x.dev/h",
			},
		],
	});
	expect(source).toBe(`import { atmn, webhook } from "atmn";

export default atmn({
	webhooks: [
		webhook({
			id: "billing",
			env: "sandbox",
			url: "https://x.dev/h",
		}),
		webhook({
			id: "everything",
			env: "sandbox",
			url: "https://x.dev/all",
		}),
	],
});
`);
	expect(warnings).toEqual([]);
});

test("pull keeps event names this atmn doesn't know, verbatim", () => {
	const { source } = pullInto({
		source: `export default atmn({
	webhooks: [],
});
`,
		remoteList: [
			remote("billing", "https://x.dev/h", {
				events: ["billing.updated", "billing.from_the_future"] as never,
			}),
		],
	});
	expect(source).toContain('"billing.from_the_future"');
	expect(source).toContain('"billing.updated"');
});
