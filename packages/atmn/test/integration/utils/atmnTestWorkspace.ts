import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FeatureService } from "../../../../../server/src/internal/features/FeatureService.js";
import { invalidateProductsCache } from "../../../../../server/src/internal/products/productCacheUtils.js";
import { getFeatures } from "../../../../../server/tests/setup/v2Features.js";
import { clearOrgDbOnly } from "../../../../../server/tests/utils/setup/clearOrg.js";
import { createTestContext } from "../../../../../server/tests/utils/testInitUtils/createTestContext.js";
import type { TestContext } from "../../../../../server/tests/utils/testInitUtils/createTestContext.js";
import type { AtmnScenario, AtmnSeedResult } from "../scenarios/types.js";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const atmnCliPath = join(repoRoot, "packages/atmn/src/cli.tsx");
const atmnComposePath = join(repoRoot, "packages/atmn/src/compose/index.ts");
const workspaceRoot = join(repoRoot, ".atmn");

type AtmnCommand = "env" | "pull" | "push";

export type PreparedAtmnScenario = AtmnSeedResult & {
	configPath: string;
	workspaceDir: string;
};

export type PreparedAtmnWorkspace = {
	configPath: string;
	workspaceDir: string;
};

type AtmnWorkspaceName = "integration" | "latest";
const scratchWorkspaceKey = "scratch";

const readWorkspaceSecretKey = (workspaceDir: string) => {
	const envPath = join(workspaceDir, ".env");
	if (!existsSync(envPath)) {
		throw new Error(
			`No .env found for atmn test workspace. Run seed first: bun atmn-test seed <scenario>`,
		);
	}

	const match = readFileSync(envPath, "utf8").match(/^AUTUMN_SECRET_KEY=(.*)$/m);
	if (!match?.[1]) {
		throw new Error(`Missing AUTUMN_SECRET_KEY in ${envPath}`);
	}

	return match[1].trim();
};

const ensureWorkspaceSecretKey = async (workspaceDir: string) => {
	const envPath = join(workspaceDir, ".env");
	if (existsSync(envPath)) return;

	ensureTestOrg();
	const ctx = await createTestContext();
	await mkdir(workspaceDir, { recursive: true });
	await writeFile(envPath, `AUTUMN_SECRET_KEY=${ctx.orgSecretKey}\n`);
};

export const getAtmnScenarioWorkspace = (
	scenario: AtmnScenario,
	workspaceName: AtmnWorkspaceName = "latest",
) => getAtmnWorkspace({ key: scenario.key, workspaceName });

const getAtmnWorkspace = ({
	key,
	workspaceName = "latest",
}: {
	key: string;
	workspaceName?: AtmnWorkspaceName;
}) =>
	key === scratchWorkspaceKey
		? workspaceRoot
		: join(workspaceRoot, key, workspaceName);

const pathToImportSpecifier = ({
	fromDir,
	toPath,
}: {
	fromDir: string;
	toPath: string;
}) => {
	const relativePath = relative(fromDir, toPath).split(sep).join("/");
	return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
};

const ensureAtmnPackageShim = async (workspaceDir: string) => {
	const packageDir = join(workspaceDir, "node_modules/atmn");
	const composeImportPath = pathToImportSpecifier({
		fromDir: packageDir,
		toPath: atmnComposePath,
	});
	const composeTypesImportPath = composeImportPath.replace(/\.ts$/, "");

	await mkdir(packageDir, { recursive: true });
	await Promise.all([
		writeFile(
			join(workspaceDir, "package.json"),
			`${JSON.stringify(
				{
					name: "atmn-test-workspace",
					private: true,
					type: "module",
				},
				null,
				2,
			)}\n`,
		),
		writeFile(
			join(workspaceDir, "tsconfig.json"),
			`${JSON.stringify(
				{
					compilerOptions: {
						allowImportingTsExtensions: true,
						module: "Preserve",
						moduleResolution: "bundler",
						noEmit: true,
						skipLibCheck: true,
						strict: true,
						target: "ES2020",
					},
					include: ["autumn.config.ts", "node_modules/atmn/index.ts"],
				},
				null,
				2,
			)}\n`,
		),
		writeFile(
			join(packageDir, "package.json"),
			`${JSON.stringify(
				{
					name: "atmn",
					type: "module",
					exports: {
						".": {
							types: "./index.d.ts",
							import: "./index.ts",
						},
					},
				},
				null,
				2,
			)}\n`,
		),
		writeFile(
			join(packageDir, "index.ts"),
			`export { feature, item, plan } from "${composeImportPath}";\n`,
		),
		writeFile(
			join(packageDir, "index.d.ts"),
			`export { feature, item, plan } from "${composeTypesImportPath}";\n`,
		),
	]);
};

const ensureTestOrg = () => {
	if (!process.env.TESTS_ORG) {
		throw new Error("TESTS_ORG is required to run atmn test scenarios");
	}
};

export const createCleanAtmnIntegrationContext = async (): Promise<TestContext> => {
	ensureTestOrg();

	const ctx = await createTestContext();
	await clearOrgDbOnly({
		db: ctx.db,
		env: ctx.env,
		orgId: ctx.org.id,
	});
	await invalidateProductsCache({
		env: ctx.env,
		orgId: ctx.org.id,
	});

	await FeatureService.insert({
		db: ctx.db,
		data: Object.values(getFeatures({ orgId: ctx.org.id })),
		logger: console,
	});
	ctx.features = await FeatureService.list({
		db: ctx.db,
		env: ctx.env,
		orgId: ctx.org.id,
	});

	return ctx;
};

export const prepareAtmnScenario = async ({
	clean = false,
	scenario,
	workspaceName = "latest",
}: {
	clean?: boolean;
	scenario: AtmnScenario;
	workspaceName?: AtmnWorkspaceName;
}): Promise<PreparedAtmnScenario> => {
	ensureTestOrg();

	const ctx = await createTestContext();

	const workspaceDir = getAtmnScenarioWorkspace(scenario, workspaceName);
	await rm(workspaceDir, { force: true, recursive: true });
	await mkdir(workspaceDir, { recursive: true });
	await ensureAtmnPackageShim(workspaceDir);

	const seedResult = await scenario.seed({ ctx });
	const configPath = join(workspaceDir, "autumn.config.ts");

	await Promise.all([
		writeFile(join(workspaceDir, ".env"), `AUTUMN_SECRET_KEY=${ctx.orgSecretKey}\n`),
		writeFile(
			join(workspaceDir, "scenario.json"),
			`${JSON.stringify(
				{
					key: scenario.key,
					description: scenario.description,
					customerId: seedResult.customerId,
					orgSlug: ctx.org.slug,
				},
				null,
				2,
			)}\n`,
		),
		writeFile(
			join(workspaceDir, "README.md"),
			[
				`# ${scenario.key}`,
				"",
				scenario.description,
				"",
				"Run from the repo root:",
				"",
				"```bash",
				`bun atmn-test pull ${scenario.key}`,
				`bun atmn-test push ${scenario.key}`,
				"```",
				"",
				"`seed` creates remote Autumn state. `pull` generates this workspace's autumn.config.ts.",
				"`push` applies the workspace config back to the seeded atmn test org.",
				"",
			].join("\n"),
		),
	]);

	return {
		...seedResult,
		configPath,
		workspaceDir,
	};
};

export const prepareAtmnIntegrationWorkspace = async ({
	reset = true,
	secretKey,
}: {
	reset?: boolean;
	secretKey: string;
}): Promise<PreparedAtmnWorkspace> => {
	ensureTestOrg();

	const workspaceDir = workspaceRoot;
	if (reset) {
		await rm(workspaceDir, { force: true, recursive: true });
	}
	await mkdir(workspaceDir, { recursive: true });
	await ensureAtmnPackageShim(workspaceDir);

	const configPath = join(workspaceDir, "autumn.config.ts");
	await Promise.all([
		writeFile(join(workspaceDir, ".env"), `AUTUMN_SECRET_KEY=${secretKey}\n`),
		writeFile(
			join(workspaceDir, "README.md"),
			[
				"# atmn integration",
				"",
				"Shared atmn integration-test workspace. Integration tests run one at a time and reset this directory before using it.",
				"",
			].join("\n"),
		),
	]);

	return {
		configPath,
		workspaceDir,
	};
};

export const prepareAtmnScratchWorkspace = async ({
	workspaceName = "latest",
}: {
	workspaceName?: AtmnWorkspaceName;
} = {}) => {
	ensureTestOrg();

	const ctx = await createTestContext();
	const workspaceDir = getAtmnWorkspace({
		key: scratchWorkspaceKey,
		workspaceName,
	});
	await mkdir(workspaceDir, { recursive: true });
	await ensureAtmnPackageShim(workspaceDir);

	const configPath = join(workspaceDir, "autumn.config.ts");
	await Promise.all([
		writeFile(join(workspaceDir, ".env"), `AUTUMN_SECRET_KEY=${ctx.orgSecretKey}\n`),
		writeFile(
			join(workspaceDir, "README.md"),
			[
				"# atmn scratch",
				"",
				"Free-form atmn workspace for manual pull/push testing.",
				"",
				"Run from the repo root:",
				"",
				"```bash",
				"bun atest pull --force --no-declaration-file",
				"bun atest push",
				"```",
				"",
			].join("\n"),
		),
	]);

	return {
		configPath,
		ctx,
		workspaceDir,
	};
};

export const resetAtmnScenario = async ({
	scenario,
	workspaceName = "latest",
}: {
	scenario: AtmnScenario;
	workspaceName?: AtmnWorkspaceName;
}) => {
	await rm(getAtmnScenarioWorkspace(scenario, workspaceName), {
		force: true,
		recursive: true,
	});
};

export const runAtmnCli = async ({
	args,
	command,
	headless = false,
	scenario,
	workspaceName = "latest",
}: {
	args?: string[];
	command: AtmnCommand;
	headless?: boolean;
	scenario: AtmnScenario;
	workspaceName?: AtmnWorkspaceName;
}) => {
	const workspaceDir = getAtmnScenarioWorkspace(scenario, workspaceName);
	const configPath = join(workspaceDir, "autumn.config.ts");
	await ensureAtmnPackageShim(workspaceDir);
	await ensureWorkspaceSecretKey(workspaceDir);

	if (command === "push" && !existsSync(configPath)) {
		throw new Error(
			`No autumn.config.ts found for "${scenario.key}". Run pull first: bun atmn-test pull ${scenario.key}`,
		);
	}

	const child = spawn(
		"bun",
		[
			atmnCliPath,
			"--local",
			...(headless ? ["--headless"] : []),
			"--config",
			configPath,
			command,
			...(args ?? []),
		],
		{
			cwd: repoRoot,
			env: {
				...process.env,
				AUTUMN_SECRET_KEY: readWorkspaceSecretKey(workspaceDir),
			},
			stdio: "inherit",
		},
	);

	const exitCode = await new Promise<number | null>((resolve) => {
		child.on("close", resolve);
	});

	if (exitCode !== 0) {
		throw new Error(`atmn ${command} failed with exit code ${exitCode}`);
	}
};

export const runAtmnWorkspaceCli = async ({
	args,
	command,
	headless = false,
	workspace,
}: {
	args?: string[];
	command: AtmnCommand;
	headless?: boolean;
	workspace: PreparedAtmnWorkspace;
}) => {
	await ensureAtmnPackageShim(workspace.workspaceDir);
	await ensureWorkspaceSecretKey(workspace.workspaceDir);

	if (command === "push" && !existsSync(workspace.configPath)) {
		throw new Error("No autumn.config.ts found for atmn integration workspace");
	}

	const child = spawn(
		"bun",
		[
			atmnCliPath,
			"--local",
			...(headless ? ["--headless"] : []),
			"--config",
			workspace.configPath,
			command,
			...(args ?? []),
		],
		{
			cwd: repoRoot,
			env: {
				...process.env,
				AUTUMN_SECRET_KEY: readWorkspaceSecretKey(workspace.workspaceDir),
			},
			stdio: "inherit",
		},
	);

	const exitCode = await new Promise<number | null>((resolve) => {
		child.on("close", resolve);
	});

	if (exitCode !== 0) {
		throw new Error(`atmn ${command} failed with exit code ${exitCode}`);
	}
};

export const runAtmnScratchCli = async ({
	args,
	command,
	headless = false,
	workspaceName = "latest",
}: {
	args?: string[];
	command: AtmnCommand;
	headless?: boolean;
	workspaceName?: AtmnWorkspaceName;
}) => {
	const prepared = await prepareAtmnScratchWorkspace({ workspaceName });
	if (command === "push" && !existsSync(prepared.configPath)) {
		throw new Error(
			`No autumn.config.ts found for scratch workspace. Run pull first: bun atmn-test pull`,
		);
	}

	const child = spawn(
		"bun",
		[
			atmnCliPath,
			"--local",
			...(headless ? ["--headless"] : []),
			"--config",
			prepared.configPath,
			command,
			...(args ?? []),
		],
		{
			cwd: repoRoot,
			env: {
				...process.env,
				AUTUMN_SECRET_KEY: readWorkspaceSecretKey(prepared.workspaceDir),
			},
			stdio: "inherit",
		},
	);

	const exitCode = await new Promise<number | null>((resolve) => {
		child.on("close", resolve);
	});

	if (exitCode !== 0) {
		throw new Error(`atmn ${command} failed with exit code ${exitCode}`);
	}
};
