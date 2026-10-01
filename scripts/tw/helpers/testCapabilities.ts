// Test files that need an extra service run on workers that have it; edit TEST_CAPABILITIES to add one.
// Dependency-light on purpose: worker/boot.ts imports this inside the sandbox.

import { readFile } from "node:fs/promises";

export type TestCapabilityId = "svix" | "ssoIdp" | "leaf";

export type CapabilityService = {
	name: string;
	/** Repo-relative working directory. */
	cwd: string;
	argv: string[];
	/** TCP port boot.ts waits on before READY. */
	port: number;
	env?: Record<string, string>;
};

export type TestCapability = {
	id: TestCapabilityId;
	/** Matched against the test file's source. */
	matches: RegExp;
	/** Added to the env of every worker on this capability's shard. */
	workerEnv: Record<string, string>;
	/** Started by worker/boot.ts on this capability's workers only. */
	service?: CapabilityService;
};

const SSO_IDP_DNS = "127.0.0.1:53535";

/** A file matching several entries runs on a worker that has all of them. */
export const TEST_CAPABILITIES: TestCapability[] = [
	{
		id: "svix",
		// Svix webhook test utils, the server's Svix client, or atmn CLI test utils (every `atmn pull` lists webhooks).
		matches:
			/from\s+["'][^"']*\/(svixWebhookTestUtils|webhookTestUtils|external\/svix\/svixUtils|atmnUtils\/\w+)(\.js)?["']/,
		workerEnv: { NEEDS_SVIX: "1" },
	},
	{
		id: "ssoIdp",
		matches: /fetch\(\s*["'`]http:\/\/localhost:9090/,
		// The server only resolves TXT records through the mock DNS when this is in its own env.
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
		// Requests to `${baseUrl}/mcp` or `baseUrl + "/mcp"`; the API proxies /mcp to Leaf on CHAT_SERVER_URL.
		matches: /(\}|\+\s*["'`])\/mcp["'`?/]/,
		workerEnv: {},
		service: {
			name: "Leaf",
			cwd: "apps/leaf",
			argv: ["bun", "src/index.ts"],
			port: 3099,
			// The /mcp route never reaches Slack, but Leaf's env schema requires these.
			env: {
				PORT: "3099",
				SLACK_CLIENT_ID: "tw",
				SLACK_CLIENT_SECRET: "tw",
				SLACK_SIGNING_SECRET: "tw",
			},
		},
	},
];

/** Max number of files read concurrently to keep file-descriptor pressure bounded. */
const READ_CONCURRENCY = 32;

/** Env var naming a worker's capabilities, comma-separated in registry order. */
const CAPABILITIES_ENV = "TW_CAPABILITIES";

/** Capabilities listed in `TW_CAPABILITIES`; unknown ids are ignored. */
export const parseWorkerCapabilities = (
	value: string | undefined,
): TestCapability[] =>
	TEST_CAPABILITIES.filter(({ id }) => value?.split(",").includes(id));

/** Every capability the file needs, in registry order. An unreadable file needs none, so a read error never moves it onto a dedicated shard. */
export const detectCapabilities = async (
	file: string,
): Promise<TestCapabilityId[]> => {
	let source: string;
	try {
		source = await readFile(file, "utf8");
	} catch {
		return [];
	}
	return TEST_CAPABILITIES.filter(({ matches }) => matches.test(source)).map(
		({ id }) => id,
	);
};

export type CapabilityShard = {
	capabilities: TestCapabilityId[];
	files: string[];
};

/** One shard per distinct capability set, in order of first appearance. */
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

/** Services boot.ts starts for the capabilities in this worker's env. */
export const workerCapabilityServices = (
	env: Record<string, string | undefined>,
): CapabilityService[] =>
	parseWorkerCapabilities(env[CAPABILITIES_ENV]).flatMap(({ service }) =>
		service ? [service] : [],
	);
