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

/** First match wins, so a file needing two capabilities lands on the earlier one. */
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
		// Requests to the API's /mcp, which proxies to Leaf on CHAT_SERVER_URL.
		matches: /\}\/mcp[`?/]/,
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

export const findTestCapability = (
	id: string | undefined,
): TestCapability | undefined =>
	TEST_CAPABILITIES.find((capability) => capability.id === id);

/** An unreadable file stays normal, so a transient read error never moves it onto a dedicated shard. */
export const detectCapability = async (
	file: string,
): Promise<TestCapabilityId | null> => {
	let source: string;
	try {
		source = await readFile(file, "utf8");
	} catch {
		return null;
	}
	return (
		TEST_CAPABILITIES.find(({ matches }) => matches.test(source))?.id ?? null
	);
};

export type CapabilityShard = {
	capability: TestCapabilityId;
	files: string[];
};

export const partitionByCapability = async (
	testFiles: string[],
): Promise<{ normalFiles: string[]; capabilityShards: CapabilityShard[] }> => {
	const detected: (TestCapabilityId | null)[] = [];
	for (let start = 0; start < testFiles.length; start += READ_CONCURRENCY) {
		const window = testFiles.slice(start, start + READ_CONCURRENCY);
		detected.push(...(await Promise.all(window.map(detectCapability))));
	}

	const normalFiles = testFiles.filter((_, index) => detected[index] === null);
	const capabilityShards = TEST_CAPABILITIES.map(({ id }) => ({
		capability: id,
		files: testFiles.filter((_, index) => detected[index] === id),
	})).filter(({ files }) => files.length > 0);
	return { normalFiles, capabilityShards };
};

export const capabilityWorkerEnv = (
	capability: TestCapabilityId | null,
): Record<string, string> => {
	const entry = capability ? findTestCapability(capability) : undefined;
	if (!entry) return {};
	return { TW_CAPABILITY: entry.id, ...entry.workerEnv };
};
