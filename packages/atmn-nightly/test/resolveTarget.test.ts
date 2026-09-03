/**
 * Which server, and which key. Small enough to be obvious, and worth pinning
 * because getting it wrong means pushing a sandbox config at production.
 */

import { expect, test } from "bun:test";
import { requireSecretKey, resolveTarget } from "../src/env/resolveTarget";

test("defaults to sandbox and the spec's server", () => {
	expect(resolveTarget({})).toEqual({ secretKeyName: "AUTUMN_SECRET_KEY" });
});

test("--prod only swaps the key, never the URL", () => {
	// The spec's server is production; --prod is about which key authenticates.
	expect(resolveTarget({ prod: true })).toEqual({
		secretKeyName: "AUTUMN_PROD_SECRET_KEY",
	});
});

test("--local targets 8080, --port overrides it", () => {
	expect(resolveTarget({ local: true }).baseUrl).toBe("http://localhost:8080");
	expect(resolveTarget({ local: true, port: "3001" }).baseUrl).toBe(
		"http://localhost:3001",
	);
});

test("--base-url wins outright", () => {
	expect(
		resolveTarget({ baseUrl: "https://staging.example.com" }).baseUrl,
	).toBe("https://staging.example.com");
});

test("--local and --prod compose: local server, prod key", () => {
	expect(resolveTarget({ local: true, prod: true })).toEqual({
		baseUrl: "http://localhost:8080",
		secretKeyName: "AUTUMN_PROD_SECRET_KEY",
	});
});

test("contradictory targets are refused, not silently ranked", () => {
	expect(() =>
		resolveTarget({ local: true, baseUrl: "https://example.com" }),
	).toThrow(/either --base-url or --local/);
	expect(() => resolveTarget({ port: "3001" })).toThrow(/only applies with/);
});

test("a missing key names the variable it wants", () => {
	const previous = process.env.AUTUMN_SECRET_KEY;
	delete process.env.AUTUMN_SECRET_KEY;
	try {
		expect(() => requireSecretKey({ target: resolveTarget({}) })).toThrow(
			/AUTUMN_SECRET_KEY is not set/,
		);
	} finally {
		if (previous !== undefined) process.env.AUTUMN_SECRET_KEY = previous;
	}
});
