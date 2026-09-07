/**
 * Which server, and which key. Small enough to be obvious, and worth pinning
 * because getting it wrong means pushing a sandbox config at production.
 */

import { expect, test } from "bun:test";
import { CLI_CLIENT_ID } from "../src/auth/oauthConfig";
import {
	DEFAULT_BASE_URL,
	requireSecretKey,
	resolveTarget,
	targetBaseUrl,
} from "../src/env/resolveTarget";

test("defaults to sandbox and the spec's server", () => {
	expect(resolveTarget({})).toEqual({
		secretKeyName: "AUTUMN_SECRET_KEY",
		clientId: CLI_CLIENT_ID,
	});
});

test("--prod only swaps the key, never the URL", () => {
	// The spec's server is production; --prod is about which key authenticates.
	expect(resolveTarget({ prod: true })).toEqual({
		secretKeyName: "AUTUMN_PROD_SECRET_KEY",
		clientId: CLI_CLIENT_ID,
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
		clientId: CLI_CLIENT_ID,
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

const withEnv = (
	values: Record<string, string | undefined>,
	run: () => void,
): void => {
	const previous = Object.fromEntries(
		Object.keys(values).map((key) => [key, process.env[key]]),
	);
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		run();
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
};

test("the client id: flag beats AUTUMN_CLIENT_ID, which beats the registered default", () => {
	withEnv(
		{ AUTUMN_CLIENT_ID: undefined, ATMN_CLI_CLIENT_ID: undefined },
		() => {
			expect(resolveTarget({}).clientId).toBe(CLI_CLIENT_ID);
		},
	);
	withEnv({ AUTUMN_CLIENT_ID: "client_from_env" }, () => {
		expect(resolveTarget({}).clientId).toBe("client_from_env");
		expect(resolveTarget({ clientId: "client_from_flag" }).clientId).toBe(
			"client_from_flag",
		);
	});
});

test("a sandbox is carried from the flag or AUTUMN_SANDBOX_ID, and absent otherwise", () => {
	withEnv({ AUTUMN_SANDBOX_ID: undefined }, () => {
		expect(resolveTarget({}).sandboxId).toBeUndefined();
		expect(resolveTarget({ sandbox: "sb_1" }).sandboxId).toBe("sb_1");
	});
	withEnv({ AUTUMN_SANDBOX_ID: "sb_env" }, () => {
		expect(resolveTarget({}).sandboxId).toBe("sb_env");
		expect(resolveTarget({ sandbox: "sb_flag" }).sandboxId).toBe("sb_flag");
	});
});

test("every command hits the same URL: the target's, else the spec's server", () => {
	withEnv({ AUTUMN_BASE_URL: undefined }, () => {
		expect(targetBaseUrl({ target: resolveTarget({}) })).toBe(DEFAULT_BASE_URL);
		expect(targetBaseUrl({ target: resolveTarget({ local: true }) })).toBe(
			"http://localhost:8080",
		);
	});
});
