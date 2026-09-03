import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import { generateId } from "@/utils/genUtils.js";
// Relative rather than a package import: atmn-nightly publishes only its bin,
// and exposing src through `exports` for a test's benefit would leak internals
// into the published package.
import { runPush } from "../../../../packages/atmn-nightly/src/actions/push";
import { createClient } from "../../../../packages/atmn-nightly/src/generated/client";

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

const CLI_PACKAGE_DIR = join(
	import.meta.dir,
	"../../../../packages/atmn-nightly",
);
const TMP_ROOT = join(CLI_PACKAGE_DIR, "test/.tmp");

type ScenarioSetup = Parameters<typeof initScenario>[0]["setup"];

export type AtmnScenario = {
	/** Directory holding autumn.config.ts — the CLI's cwd. */
	cwd: string;
	/** Base URL the scenario's client talks to — reuse for any client a test builds itself. */
	baseUrl: string;
	/** Rewrite the config between steps. */
	writeConfig: (source: string) => void;
	push: (options?: { dryRun?: boolean }) => Promise<{
		output: string;
		migrationIds: string[];
	}>;
	/** What the config currently evaluates to — the wire document. */
	wireFromConfig: () => Promise<Record<string, unknown>>;
	cleanup: () => void;
};

/**
 * Source for a config that imports the generated builders by absolute path.
 * Absolute because a temp dir deep under the package still resolves, and it
 * keeps the fixture readable in the test.
 */
export const atmnConfigSource = ({ body }: { body: string }): string =>
	`import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn(${body});
`;

export const initAtmnScenario = async ({
	setup,
	config,
	baseUrl = process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080",
}: {
	setup: ScenarioSetup;
	/** Body passed to `atmn({...})`, as source. */
	config: string;
	baseUrl?: string;
}): Promise<AtmnScenario & Awaited<ReturnType<typeof initScenario>>> => {
	const scenario = await initScenario({ setup, actions: [] });

	const cwd = join(TMP_ROOT, generateId("atmn"));
	mkdirSync(cwd, { recursive: true });

	const configPath = join(cwd, "autumn.config.ts");
	const writeConfig = (source: string): void => {
		writeFileSync(configPath, source, "utf8");
	};
	writeConfig(atmnConfigSource({ body: config }));

	const client = createClient({
		secretKey: scenario.ctx.orgSecretKey,
		baseUrl,
	});

	return {
		...scenario,
		cwd,
		baseUrl,
		writeConfig,
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
		wireFromConfig: async () => {
			// Cache-bust: the same path is rewritten between steps.
			const module = await import(`${configPath}?v=${Date.now()}`);
			return module.default as Record<string, unknown>;
		},
		cleanup: () => rmSync(cwd, { recursive: true, force: true }),
	};
};
