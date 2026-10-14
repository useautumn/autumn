import { readFile } from "node:fs/promises";

export type TestCapabilityId =
	| "svix"
	| "ssoIdp"
	| "leaf"
	| "stripe-connect"
	| "pg-replica";

export type CapabilityService = {
	name: string;
	cwd: string;
	argv: string[];
	port: number;
	env?: Record<string, string>;
};

export type TestCapability = {
	id: TestCapabilityId;
	matches?: RegExp;
	paths?: RegExp;
	workerEnv: Record<string, string>;
	service?: CapabilityService;
	maxWorkers?: number;
};

const SSO_IDP_DNS = "127.0.0.1:53535";

export const PG_REPLICA_PORT = 5433;

export const TEST_CAPABILITIES: TestCapability[] = [
	{
		id: "svix",
		matches:
			/from\s+["'][^"']*\/(svixWebhookTestUtils|webhookTestUtils|external\/svix\/svixUtils|atmnUtils\/\w+)(\.js)?["']/,
		workerEnv: { NEEDS_SVIX: "1" },
	},
	{
		id: "ssoIdp",
		matches: /fetch\(\s*["'`]http:\/\/localhost:9090/,
		workerEnv: { SSO_DNS_SERVERS: SSO_IDP_DNS },
		service: {
			name: "SSO test IdP",
			cwd: "apps/sso-test-idp",
			argv: ["bun", "src/index.ts"],
			port: 9090,
		},
	},
	{
		id: "leaf",
		matches: /(\}|\+\s*["'`])\/mcp["'`?/]/,
		workerEnv: {},
		service: {
			name: "Leaf",
			cwd: "apps/leaf",
			argv: ["bun", "src/index.ts"],
			port: 3099,
			env: {
				PORT: "3099",
				SLACK_CLIENT_ID: "tw",
				SLACK_CLIENT_SECRET: "tw",
				SLACK_SIGNING_SECRET: "tw",
			},
		},
	},
	{
		id: "stripe-connect",
		// Real OAuth revocation needs the client_id of the platform that owns the worker's Stripe key.
		matches: /\.oauth\.deauthorize\(/,
		workerEnv: {},
		maxWorkers: 1,
	},
	{
		id: "pg-replica",
		paths: /\/integration\/replica-reads\//,
		workerEnv: {
			TW_PG_REPLICA: "1",
			DATABASE_REPLICA_URL: `postgresql://postgres:postgres@localhost:${PG_REPLICA_PORT}/autumn`,
		},
	},
];

const READ_CONCURRENCY = 32;

const CAPABILITIES_ENV = "TW_CAPABILITIES";

export const parseWorkerCapabilities = (
	value: string | undefined,
): TestCapability[] =>
	TEST_CAPABILITIES.filter(({ id }) => value?.split(",").includes(id));

export const detectCapabilities = async (
	file: string,
): Promise<TestCapabilityId[]> => {
	let source: string;
	try {
		source = await readFile(file, "utf8");
	} catch {
		return [];
	}
	return TEST_CAPABILITIES.filter(
		({ matches, paths }) => matches?.test(source) || paths?.test(file),
	).map(({ id }) => id);
};

export type CapabilityShard = {
	capabilities: TestCapabilityId[];
	files: string[];
};

export const partitionByCapability = async (
	testFiles: string[],
): Promise<{ normalFiles: string[]; capabilityShards: CapabilityShard[] }> => {
	const detected: TestCapabilityId[][] = [];
	for (let start = 0; start < testFiles.length; start += READ_CONCURRENCY) {
		const window = testFiles.slice(start, start + READ_CONCURRENCY);
		detected.push(...(await Promise.all(window.map(detectCapabilities))));
	}

	const normalFiles: string[] = [];
	const shards = new Map<string, CapabilityShard>();
	for (const [index, file] of testFiles.entries()) {
		const capabilities = detected[index] ?? [];
		if (capabilities.length === 0) {
			normalFiles.push(file);
			continue;
		}
		const key = capabilities.join(",");
		const shard = shards.get(key) ?? { capabilities, files: [] };
		shard.files.push(file);
		shards.set(key, shard);
	}
	return { normalFiles, capabilityShards: [...shards.values()] };
};

export const capabilityWorkerEnv = (
	capabilities: TestCapabilityId[],
): Record<string, string> => {
	const entries = parseWorkerCapabilities(capabilities.join(","));
	if (entries.length === 0) return {};
	return Object.assign(
		{ [CAPABILITIES_ENV]: entries.map(({ id }) => id).join(",") },
		...entries.map(({ workerEnv }) => workerEnv),
	);
};

export const maxWorkersFor = (
	capabilities: readonly string[],
): number | undefined => {
	const caps = TEST_CAPABILITIES.filter(
		({ id, maxWorkers }) =>
			capabilities.includes(id) && maxWorkers !== undefined,
	).map(({ maxWorkers }) => maxWorkers as number);
	return caps.length > 0 ? Math.min(...caps) : undefined;
};

export const workerCapabilityServices = (
	env: Record<string, string | undefined>,
): CapabilityService[] =>
	parseWorkerCapabilities(env[CAPABILITIES_ENV]).flatMap(({ service }) =>
		service ? [service] : [],
	);
