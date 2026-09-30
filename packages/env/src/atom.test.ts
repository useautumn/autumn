import { describe, expect, test } from "bun:test";
import { createAtomEnv } from "./atom.js";

const TOKEN_HASH = "a".repeat(64);

describe("atom env", () => {
	test("an org's deployment is given its token hash", () => {
		const env = createAtomEnv({
			ATOM_TOKEN_HASH: TOKEN_HASH,
			ATOM_HOSTNAME: "0.0.0.0",
		});

		expect(env.ATOM_DEV).toBe(false);
		expect(env.ATOM_TOKEN_HASH).toBe(TOKEN_HASH);
	});

	test("a dev stack needs nothing but the flag", () => {
		const env = createAtomEnv({ ATOM_DEV: "true" });

		expect(env.ATOM_DEV).toBe(true);
		expect(env.ATOM_HOSTNAME).toBe("127.0.0.1");
	});

	test("dev mode never listens beyond loopback", () => {
		expect(() =>
			createAtomEnv({ ATOM_DEV: "true", ATOM_HOSTNAME: "0.0.0.0" }),
		).toThrow("loopback");
	});

	test("neither or both modes is refused", () => {
		expect(() => createAtomEnv({})).toThrow("ATOM_TOKEN_HASH");
		expect(() =>
			createAtomEnv({ ATOM_DEV: "true", ATOM_TOKEN_HASH: TOKEN_HASH }),
		).toThrow("not both");
		expect(() => createAtomEnv({ ATOM_TOKEN_HASH: "not-a-hash" })).toThrow(
			"SHA-256",
		);
	});

	test("forwards to the public Autumn API unless told where the API is", () => {
		const deployed = createAtomEnv({ ATOM_TOKEN_HASH: TOKEN_HASH });
		const local = createAtomEnv({
			ATOM_DEV: "true",
			AUTUMN_API_URL: "http://localhost:8080",
		});

		expect(deployed.ATOM_AUTUMN_API_URL).toBe("https://api.useautumn.com");
		expect(local.ATOM_AUTUMN_API_URL).toBe("http://localhost:8080");
	});
});
