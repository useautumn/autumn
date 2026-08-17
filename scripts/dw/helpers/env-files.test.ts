import { describe, expect, test } from "bun:test";
import { urlsForEntry } from "./env-files.ts";
import { aliasesFor } from "./ports.ts";

describe("urlsForEntry", () => {
	test("laptop UI stays portless; browser API uses the public host", () => {
		const aliases = aliasesFor(45);
		const urls = urlsForEntry({
			branchName: "dw-wt-45-ae30d9",
			createdAt: 0,
			path: "/tmp/wt45",
			publicUrl: "https://autumn-wt45-aa11bb.autumnworktree.com",
			worktreeNum: 45,
		});
		expect(urls.apiUrl).toBe(aliases.apiUrl);
		expect(urls.browserApiUrl).toBe(
			"https://autumn-wt45-aa11bb-api.autumnworktree.com",
		);
		expect(urls.publicApiUrl).toBe(
			"https://autumn-wt45-aa11bb-api.autumnworktree.com",
		);
		expect(urls.viteUrl).toBe(aliases.viteUrl);
	});
});
