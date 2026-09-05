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
const CLI_ENTRY = join(CLI_PACKAGE_DIR, "src/cli.ts");

/**
 * Every push and pull runs the real CLI in a fresh process: a config's
 * imported files are re-read each time, which an in-process import cannot
 * promise, and the output is what a user sees.
 */
const runCli = ({
	cwd,
	args,
	secretKey,
	baseUrl,
}: {
	cwd: string;
	args: string[];
	secretKey: string;
	baseUrl: string;
}): string => {
	const result = Bun.spawnSync(["bun", CLI_ENTRY, ...args], {
		cwd,
		env: {
			...process.env,
			AUTUMN_SECRET_KEY: secretKey,
			AUTUMN_BASE_URL: baseUrl,
			NO_COLOR: "1",
			FORCE_COLOR: "0",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = `${result.stdout.toString()}${result.stderr.toString()}`;
	if (result.exitCode !== 0) throw new Error(output.trim());
	return output;
};

/** Ids under the "Draft migrations (n)" heading, one per indented line. */
const migrationIdsIn = (output: string): string[] => {
	const lines = output.split("\n");
	const start = lines.findIndex((line) =>
		line.startsWith("Draft migrations ("),
	);
	if (start === -1) return [];
	const ids: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.trim() === "") break;
		const segments = line.trim().split("/");
		const id = segments[segments.length - 1];
		if (id) ids.push(id);
	}
	return ids;
};

const PULL_EDIT_LINE = /^([+~-]) (\S+)$/;

/** Pull prints one line per edit: `+ id`, `~ id`, `- id`. */
const pullEditsIn = (
	output: string,
): { appended: string[]; replaced: string[]; deleted: string[] } => {
	const edits = {
		appended: [] as string[],
		replaced: [] as string[],
		deleted: [] as string[],
	};
	for (const raw of output.split("\n")) {
		const match = PULL_EDIT_LINE.exec(raw.trim());
		if (!match) continue;
		const [, symbol, id] = match;
		if (symbol === "+") edits.appended.push(id);
		else if (symbol === "~") edits.replaced.push(id);
		else edits.deleted.push(id);
	}
	return edits;
};

type ScenarioSetup = Parameters<typeof initScenario>[0]["setup"];

/** Resolves initScenario's with-customer overload, so the scenario type carries `customerId: string`. */
const initScenarioWithCustomer = ({
	setup,
	customerId,
}: {
	setup: ScenarioSetup;
	customerId: string;
}) => initScenario({ setup, actions: [], customerId });
type ScenarioWithCustomer = Awaited<
	ReturnType<typeof initScenarioWithCustomer>
>;

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
	customerId = generateId("atmn_cus"),
	baseUrl = process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080",
}: {
	setup: ScenarioSetup;
	/** The scenario's primary customer; initScenario only creates one when given an id. */
	customerId?: string;
	/** Body passed to `atmn({...})`, as source; or a whole file when `raw` is set. */
	config: string | { raw: string };
	/** Extra files under cwd (relative path → source), written before the config. */
	files?: Record<string, string>;
	baseUrl?: string;
}): Promise<AtmnScenario & ScenarioWithCustomer> => {
	const scenario = await initScenarioWithCustomer({ setup, customerId });

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
			const output = runCli({
				cwd,
				args: ["push", ...(dryRun ? ["--dry-run"] : [])],
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl,
			});
			return { output, migrationIds: migrationIdsIn(output) };
		},
		pull: async ({ includeMappings = false } = {}) => {
			const output = runCli({
				cwd,
				args: ["pull", ...(includeMappings ? ["--include-mappings"] : [])],
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl,
			});
			return { output, ...pullEditsIn(output) };
		},
		wireFromConfig: async () => {
			// A fresh process: files the config imports are re-read every time.
			const result = Bun.spawnSync(
				[
					"bun",
					"-e",
					`import(${JSON.stringify(configPath)}).then((m) => process.stdout.write(JSON.stringify(m.default)))`,
				],
				{ cwd, stdout: "pipe", stderr: "pipe" },
			);
			if (result.exitCode !== 0)
				throw new Error(result.stderr.toString().trim());
			return JSON.parse(result.stdout.toString()) as Record<string, unknown>;
		},
		attachCustomer: async ({ planId, customerId }) => {
			const target = customerId ?? scenario.customerId;
			if (target === undefined)
				throw new Error(
					"attachCustomer needs a customer: set one up with s.customer() or pass customerId",
				);
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
