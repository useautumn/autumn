import { afterEach, describe, expect, test } from "bun:test";
import { LOCAL_DATABASE_URL } from "../constants.ts";
import {
	databaseUrlForEnvLocal,
	provisionedInfraEnv,
	urlsForEntry,
} from "./env-files.ts";
import { aliasesFor } from "./ports.ts";

const cloudEntry = {
	branchName: "dw-wt-45-ae30d9",
	createdAt: 0,
	path: "/tmp/wt45",
	publicUrl: "https://autumn-wt45-aa11bb.autumnworktree.com",
	worktreeNum: 45,
} as const;

describe("urlsForEntry", () => {
	const prevCloud = process.env.CLOUD_AGENT;
	const prevLegacy = process.env.DW_HEADLESS;

	afterEach(() => {
		if (prevCloud === undefined) delete process.env.CLOUD_AGENT;
		else process.env.CLOUD_AGENT = prevCloud;
		if (prevLegacy === undefined) delete process.env.DW_HEADLESS;
		else process.env.DW_HEADLESS = prevLegacy;
	});

	test("laptop infrastructure supplies its own Kafka; cloud has no Docker endpoint", () => {
		delete process.env.CLOUD_AGENT;
		delete process.env.DW_HEADLESS;
		expect(provisionedInfraEnv(6).KAFKA_BROKERS).toBe("127.0.0.1:19592");
		process.env.CLOUD_AGENT = "1";
		expect(provisionedInfraEnv(6).KAFKA_BROKERS).toBeUndefined();
	});

	test("laptop UI and browser API stay on portless; public API is inbound-only", () => {
		delete process.env.CLOUD_AGENT;
		delete process.env.DW_HEADLESS;
		const aliases = aliasesFor(45);
		const urls = urlsForEntry(cloudEntry);
		expect(urls.apiUrl).toBe(aliases.apiUrl);
		expect(urls.browserApiUrl).toBe(aliases.apiUrl);
		expect(urls.publicApiUrl).toBe(
			"https://autumn-wt45-aa11bb-api.autumnworktree.com",
		);
		expect(urls.viteUrl).toBe(aliases.viteUrl);
	});

	test("local Postgres keeps sslmode unset; Neon URLs get verify-full", () => {
		expect(databaseUrlForEnvLocal(LOCAL_DATABASE_URL)).toBe(LOCAL_DATABASE_URL);
		expect(
			databaseUrlForEnvLocal(
				"postgresql://user:pass@ep-foo.us-east-2.aws.neon.tech/autumn",
			),
		).toContain("sslmode=verify-full");
	});

	test("Cloud agent browsers use public hosts; API stays loopback", () => {
		delete process.env.DW_HEADLESS;
		process.env.CLOUD_AGENT = "1";
		const urls = urlsForEntry(cloudEntry);
		expect(urls.apiUrl).toBe("http://localhost:12480");
		expect(urls.browserApiUrl).toBe(
			"https://autumn-wt45-aa11bb-api.autumnworktree.com",
		);
		expect(urls.publicApiUrl).toBe(
			"https://autumn-wt45-aa11bb-api.autumnworktree.com",
		);
		expect(urls.viteUrl).toBe("https://autumn-wt45-aa11bb.autumnworktree.com");
	});
});
