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
});
