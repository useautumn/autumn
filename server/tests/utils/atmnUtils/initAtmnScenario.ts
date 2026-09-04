import {
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { AttachParamsV1Input } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import { generateId } from "@/utils/genUtils.js";
// Relative rather than a package import: atmn-nightly publishes only its bin,
// and exposing src through `exports` for a test's benefit would leak internals
// into the published package.
import { runPull } from "../../../../packages/atmn-nightly/src/actions/pull";
import { runPush } from "../../../../packages/atmn-nightly/src/actions/push";
import {
	type AutumnClient,
	createClient,
} from "../../../../packages/atmn-nightly/src/generated/client";
import { seedVersionableCustomer } from "../../integration/catalog-v2/plans/migrations/utils/seedVersionableCustomer.js";

/**
 * atmn e2e lives here rather than in the CLI package for one reason: this is
 * where a fresh org and a working key are one line. Rebuilding sub-org
 * provisioning inside atmn-nightly to avoid an import would be the tail wagging
 * the dog.
 *
 * Configs are written to real files because that is what the CLI reads, and
 * because pull's whole job is surgery on a file. They live under the workspace
 * so `import from "atmn-nightly"` resolves, and are gitignored.
 */

export const CLI_PACKAGE_DIR = join(
	import.meta.dir,
	"../../../../packages/atmn-nightly",
);
export const TMP_ROOT = join(CLI_PACKAGE_DIR, "test/.tmp");

type ScenarioSetup = Parameters<typeof initScenario>[0]["setup"];

export type PullOutcome = {
	output: string;
	appended: string[];
	replaced: string[];
	deleted: string[];
};

export type AtmnScenario = {
	/** Directory holding autumn.config.ts — the CLI's cwd. */
	cwd: string;
	configPath: string;
	/** Base URL the scenario's client talks to — reuse for any client a test builds itself. */
	baseUrl: string;
	/** The CLI client for this org: previewUpdate / update / get. */
	client: AutumnClient;
	/** Rewrite the config between steps. */
	writeConfig: (source: string) => void;
	/** Write any other file under cwd, relative path; folders are created. */
	writeFile: (relativePath: string, source: string) => void;
	/** Every .ts under cwd, relative path → text. Snapshot before, compare after. */
	files: () => Map<string, string>;
	push: (options?: { dryRun?: boolean }) => Promise<{
		output: string;
		migrationIds: string[];
	}>;
	pull: (options?: { includeMappings?: boolean }) => Promise<PullOutcome>;
	/** What the config currently evaluates to — the wire document. */
	wireFromConfig: () => Promise<Record<string, unknown>>;
	/** A real attach through the billing API: customer_products, entitlements, prices. */
	attachCustomer: (params: {
		planId: string;
		customerId?: string;
	}) => Promise<void>;
	/** A customer on one plan version, DB only, no Stripe — cheap, counts migrations. */
	seedCustomer: (params: { planId: string; version?: number }) => Promise<void>;
	cleanup: () => void;
};

/**
 * Source for a config that imports the generated builders by absolute path.
 * Absolute because a temp dir deep under the package still resolves, and it
 * keeps the fixture readable in the test.
 */
export const atmnConfigSource = ({ body }: { body: string }): string =>
	`${atmnImports()}
export default atmn(${body});
`;

/** The import lines any config file under the temp dir can use. */
export const atmnImports = (): string =>
	`import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";
`;

const listTs = (dir: string, root: string, out: Map<string, string>): void => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			listTs(path, root, out);
		} else if (entry.name.endsWith(".ts")) {
			out.set(path.slice(root.length + 1), readFileSync(path, "utf8"));
		}
	}
};

export const initAtmnScenario = async ({
	setup,
	config,
	files = {},
	baseUrl = process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080",
}: {
	setup: ScenarioSetup;
	/** Body passed to `atmn({...})`, as source; or a whole file when `raw` is set. */
	config: string | { raw: string };
	/** Extra files under cwd (relative path → source), written before the config. */
	files?: Record<string, string>;
	baseUrl?: string;
}): Promise<AtmnScenario & Awaited<ReturnType<typeof initScenario>>> => {
	const scenario = await initScenario({ setup, actions: [] });

	const cwd = join(TMP_ROOT, generateId("atmn"));
	mkdirSync(cwd, { recursive: true });

	const configPath = join(cwd, "autumn.config.ts");
	const writeFile = (relativePath: string, source: string): void => {
		const path = join(cwd, relativePath);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, source, "utf8");
	};
	const writeConfig = (source: string): void => {
		writeFileSync(configPath, source, "utf8");
	};
	for (const [relativePath, source] of Object.entries(files))
		writeFile(relativePath, source);
	writeConfig(
		typeof config === "string"
			? atmnConfigSource({ body: config })
			: config.raw,
	);

	const client = createClient({
		secretKey: scenario.ctx.orgSecretKey,
		baseUrl,
	});

	return {
		...scenario,
		cwd,
		configPath,
		baseUrl,
		client,
		writeConfig,
		writeFile,
		files: () => {
			const out = new Map<string, string>();
			listTs(cwd, cwd, out);
			return out;
		},
		push: async ({ dryRun = false } = {}) => {
			let output = "";
			const result = await runPush({
				client,
				cwd,
				dryRun,
				write: (text: string) => {
					output += text;
				},
			});
			return { output, migrationIds: result.migrationIds };
		},
		pull: async ({ includeMappings = false } = {}) => {
			let output = "";
			const result = await runPull({
				client,
				cwd,
				includeMappings,
				write: (text: string) => {
					output += text;
				},
			});
			return {
				output,
				appended: result.appended,
				replaced: result.replaced,
				deleted: result.deleted,
			};
		},
		wireFromConfig: async () => {
			// Cache-bust: the same path is rewritten between steps.
			const module = await import(`${configPath}?v=${Date.now()}`);
			return module.default as Record<string, unknown>;
		},
		attachCustomer: async ({ planId, customerId }) => {
			const target = customerId ?? scenario.customerId;
			if (target === undefined)
				throw new Error("attachCustomer needs a customer: set one up with s.customer() or pass customerId");
			await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: target,
				plan_id: planId,
			});
		},
		seedCustomer: async ({ planId, version }) => {
			await seedVersionableCustomer({ ctx: scenario.ctx, planId, version });
		},
		cleanup: () => rmSync(cwd, { recursive: true, force: true }),
	};
};
