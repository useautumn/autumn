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
import {
	type AutumnClient,
	createClient,
} from "../../../../packages/atmn/src/generated/client";
import { seedVersionableCustomer } from "../../integration/catalog-v2/plans/migrations/utils/seedVersionableCustomer.js";

export const CLI_PACKAGE_DIR = join(
	import.meta.dir,
	"../../../../packages/atmn",
);
export const TMP_ROOT = join(CLI_PACKAGE_DIR, "test/.tmp");
const CLI_ENTRY = join(CLI_PACKAGE_DIR, "src/cli.ts");

export const scenarioDir = ({ id }: { id: string }): string => {
	const dir = join(TMP_ROOT, id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "package.json"), "{}\n");
	return dir;
};

export const cliProcessEnv = (): Record<string, string> => ({
	...(process.env as Record<string, string>),
	GIT_CEILING_DIRECTORIES: TMP_ROOT,
	NO_COLOR: "1",
	FORCE_COLOR: "0",
});

const spawnOutput = async ({
	cmd,
	cwd,
	env,
}: {
	cmd: string[];
	cwd: string;
	env?: Record<string, string>;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
	const proc = Bun.spawn(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode };
};

export const runCli = async ({
	cwd,
	args,
	secretKey,
	baseUrl,
}: {
	cwd: string;
	args: string[];
	secretKey: string;
	baseUrl: string;
}): Promise<string> => {
	const result = await spawnOutput({
		cmd: ["bun", CLI_ENTRY, ...args],
		cwd,
		env: {
			...cliProcessEnv(),
			AUTUMN_SECRET_KEY: secretKey,
			AUTUMN_BASE_URL: baseUrl,
		},
	});
	const output = `${result.stdout}${result.stderr}`;
	if (result.exitCode !== 0) throw new Error(output.trim());
	return output;
};

export const wireOfConfig = async ({
	configPath,
}: {
	configPath: string;
}): Promise<Record<string, unknown>> => {
	const result = await spawnOutput({
		cmd: [
			"bun",
			"-e",
			`import(${JSON.stringify(configPath)}).then((m) => process.stdout.write(JSON.stringify(m.default)))`,
		],
		cwd: dirname(configPath),
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.trim());
	return JSON.parse(result.stdout) as Record<string, unknown>;
};

const migrationIdsIn = (output: string): string[] => {
	const lines = output.split("\n");
	let start = -1;
	for (const [index, line] of lines.entries()) {
		if (line.trim().startsWith("Draft migrations (")) start = index;
	}
	if (start === -1) return [];
	const ids: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (!line.startsWith("  ")) break;
		const segments = line.trim().split("/");
		const id = segments[segments.length - 1];
		if (id && id !== "?") ids.push(id);
	}
	return ids;
};

const PULL_EDIT_LINE = /^([+~-]) (\S+)$/;

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
	cwd: string;
	configPath: string;
	baseUrl: string;
	secretKey: string;
	client: AutumnClient;
	writeConfig: (source: string) => void;
	writeFile: (relativePath: string, source: string) => void;
	files: () => Map<string, string>;
	push: (options?: { dryRun?: boolean }) => Promise<{
		output: string;
		migrationIds: string[];
	}>;
	pull: (options?: { includeMappings?: boolean }) => Promise<PullOutcome>;
	preview: () => Promise<Record<string, unknown>>;
	wireFromConfig: () => Promise<Record<string, unknown>>;
	attachCustomer: (params: {
		planId: string;
		customerId?: string;
	}) => Promise<void>;
	seedCustomer: (params: { planId: string; version?: number }) => Promise<{
		customerId: string;
		internalCustomerId: string;
		cusProductId: string;
	}>;
	cleanup: () => void;
};

export const atmnConfigSource = ({ body }: { body: string }): string =>
	`${atmnImports()}
export default atmn(${body});
`;

export const atmnImports = (): string =>
	`import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";
import { referralProgram } from "${CLI_PACKAGE_DIR}/src/generated/referralPrograms";
import { coupon, featureGrant } from "${CLI_PACKAGE_DIR}/src/generated/rewards";
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
	customerId?: string;
	config: string | { raw: string };
	files?: Record<string, string>;
	baseUrl?: string;
}): Promise<AtmnScenario & ScenarioWithCustomer> => {
	const scenario = await initScenarioWithCustomer({ setup, customerId });

	const cwd = scenarioDir({ id: generateId("atmn") });

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
		secretKey: scenario.ctx.orgSecretKey,
		client,
		writeConfig,
		writeFile,
		files: () => {
			const out = new Map<string, string>();
			listTs(cwd, cwd, out);
			return out;
		},
		push: async ({ dryRun = false } = {}) => {
			const output = await runCli({
				cwd,
				args: ["push", dryRun ? "--dry-run" : "--yes"],
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl,
			});
			return { output, migrationIds: migrationIdsIn(output) };
		},
		pull: async ({ includeMappings = false } = {}) => {
			const output = await runCli({
				cwd,
				args: ["pull", ...(includeMappings ? ["--include-mappings"] : [])],
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl,
			});
			return { output, ...pullEditsIn(output) };
		},
		wireFromConfig: () => wireOfConfig({ configPath }),
		preview: async () =>
			(await client.previewUpdate(
				// biome-ignore lint/suspicious/noExplicitAny: the wire is the CLI's own document
				(await wireOfConfig({ configPath })) as any,
			)) as Record<string, unknown>,
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
		seedCustomer: async ({ planId, version }) =>
			await seedVersionableCustomer({ ctx: scenario.ctx, planId, version }),
		cleanup: () => {
			rmSync(cwd, { recursive: true, force: true });
			if (scenario.customerId !== undefined)
				void scenario.autumnV2_3.customers
					.delete(scenario.customerId)
					.catch(() => undefined);
		},
	};
};
