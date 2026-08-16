import { describe, expect, test } from "bun:test";
import { firstHttpsUrl, reservedDomainName } from "./ngrok.ts";

describe("reservedDomainName", () => {
	test("same machine + path is stable", () => {
		const a = reservedDomainName({
			machineId: "abc",
			path: "/workspace",
			worktreeNum: 1,
		});
		const b = reservedDomainName({
			machineId: "abc",
			path: "/workspace",
			worktreeNum: 1,
		});
		expect(a).toBe(b);
		expect(a).toMatch(/^autumn-wt1-[a-f0-9]{6}\.ngrok\.app$/);
	});

	test("different machines on the same path get different names", () => {
		const cloudA = reservedDomainName({
			machineId: "vm-one",
			path: "/workspace",
			worktreeNum: 1,
		});
		const cloudB = reservedDomainName({
			machineId: "vm-two",
			path: "/workspace",
			worktreeNum: 1,
		});
		expect(cloudA).not.toBe(cloudB);
	});
});

describe("firstHttpsUrl", () => {
	test("keeps dots in the hostname", () => {
		expect(firstHttpsUrl("https://abc.ngrok.app.\n")).toBe(
			"https://abc.ngrok.app",
		);
	});
});
