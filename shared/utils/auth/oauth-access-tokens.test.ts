import { describe, expect, test } from "bun:test";
import { getOAuthAccessTokenValues, hashOAuthToken } from "./oauthAccessTokens";

describe("oauthAccessTokens", () => {
	test("hashes tokens as unpadded base64url SHA-256, matching better-auth", async () => {
		// Fixed vector: changing the hash format would orphan every stored token.
		expect(await hashOAuthToken("test")).toBe(
			"n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg",
		);
	});

	test("matches against both the hashed and legacy raw token values", async () => {
		expect(await getOAuthAccessTokenValues("test")).toEqual([
			"n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg",
			"test",
		]);
	});
});
