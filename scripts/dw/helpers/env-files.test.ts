import { describe, expect, test } from "bun:test";
import { urlsForEntry } from "./env-files.ts";
import { aliasesFor } from "./ports.ts";

describe("urlsForEntry", () => {
	test("laptop UI stays portless; browser API uses the public host", () => {
		const prev = process.env.DW_HEADLESS;
		delete process.env.DW_HEADLESS;
		try {
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
		} finally {
			if (prev === undefined) delete process.env.DW_HEADLESS;
			else process.env.DW_HEADLESS = prev;
		}
	});

	test("headless Cloud uses public dashboard and API hosts", () => {
		const prev = process.env.DW_HEADLESS;
		process.env.DW_HEADLESS = "1";
		try {
			const urls = urlsForEntry({
				createdAt: 0,
				path: "/workspace",
				publicUrl: "https://autumn-wt1-c3aec0.autumnworktree.com",
				worktreeNum: 1,
			});
			expect(urls.browserApiUrl).toBe(
				"https://autumn-wt1-c3aec0-api.autumnworktree.com",
			);
			expect(urls.publicApiUrl).toBe(
				"https://autumn-wt1-c3aec0-api.autumnworktree.com",
			);
			expect(urls.viteUrl).toBe(
				"https://autumn-wt1-c3aec0.autumnworktree.com",
			);
			expect(urls.apiUrl).toBe("http://localhost:8080");
		} finally {
			if (prev === undefined) delete process.env.DW_HEADLESS;
			else process.env.DW_HEADLESS = prev;
		}
	});
});
