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

test("the most specific target wins: base-url over local over port", () => {
	// A URL is more specific than a host, which is more specific than a port;
	// refusing the combination made a scripted `-l` plus an ad-hoc `-b` a
	// two-step edit instead of an override.
	expect(
		resolveTarget({ local: true, baseUrl: "https://example.com" }).baseUrl,
	).toBe("https://example.com");
	expect(
		resolveTarget({ port: "3001", baseUrl: "https://example.com" }).baseUrl,
	).toBe("https://example.com");
	// --port alone is a local target: the port implies the host.
	expect(resolveTarget({ port: "3001" }).baseUrl).toBe("http://localhost:3001");
});

test("flags beat AUTUMN_BASE_URL, which beats the spec's server", () => {
	const previous = process.env.AUTUMN_BASE_URL;
	process.env.AUTUMN_BASE_URL = "http://localhost:11380";
	try {
		expect(resolveTarget({}).baseUrl).toBe("http://localhost:11380");
		expect(resolveTarget({ local: true }).baseUrl).toBe(
			"http://localhost:8080",
		);
	} finally {
		if (previous === undefined) delete process.env.AUTUMN_BASE_URL;
		else process.env.AUTUMN_BASE_URL = previous;
	}
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
