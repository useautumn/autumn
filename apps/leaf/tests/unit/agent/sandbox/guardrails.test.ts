import { describe, expect, test } from "bun:test";
import {
	assertSafeSandboxCommand,
	sanitizeReturnFiles,
	sanitizeSandboxFiles,
	truncateText,
} from "../../../../src/agent/sandbox/guardrails.js";

describe("sandbox guardrails", () => {
	test("normalizes relative file paths under /work", () => {
		expect(
			sanitizeSandboxFiles([{ path: "input.json", content: "{}" }]),
		).toEqual([{ path: "/work/input.json", content: "{}" }]);
		expect(sanitizeReturnFiles(["result.json"])).toEqual(["/work/result.json"]);
	});

	test("rejects files outside /work", () => {
		expect(() =>
			sanitizeSandboxFiles([{ path: "../secrets.txt", content: "x" }]),
		).toThrow("Sandbox files must stay under /work");
		expect(() => sanitizeReturnFiles(["/etc/passwd"])).toThrow(
			"Sandbox files must stay under /work",
		);
	});

	test("rejects .env files", () => {
		expect(() =>
			sanitizeSandboxFiles([{ path: ".env", content: "FOO=bar" }]),
		).toThrow("Sandbox files cannot be named .env");
	});

	test("rejects token-like input", () => {
		expect(() =>
			sanitizeSandboxFiles([
				{ path: "input.txt", content: "SLACK_BOT_TOKEN=xoxb-1234567890" },
			]),
		).toThrow("Sandbox input appears to contain a secret or token");
		expect(() =>
			assertSafeSandboxCommand("echo Bearer abcdefghijklmnopqrstuvwxyz"),
		).toThrow("Sandbox input appears to contain a secret or token");
	});

	test("enforces file count and total bytes", () => {
		expect(() =>
			sanitizeSandboxFiles(
				Array.from({ length: 6 }, (_, index) => ({
					path: `file-${index}.txt`,
					content: "x",
				})),
			),
		).toThrow("Sandbox input cannot exceed 5 files");
		expect(() =>
			sanitizeSandboxFiles([
				{ path: "large.txt", content: "x".repeat(257 * 1024) },
			]),
		).toThrow("Sandbox input is too large");
	});

	test("truncates text by bytes", () => {
		const result = truncateText("a".repeat(10), 5);
		expect(result).toBe("aaaaa\n[truncated]");
	});
});
