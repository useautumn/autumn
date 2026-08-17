import { afterEach, describe, expect, test } from "bun:test";
import { urlsForEntry } from "./env-files.ts";
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
