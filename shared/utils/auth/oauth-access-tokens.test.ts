import { expect, test } from "bun:test";
import { hashOAuthToken } from "./oauthAccessTokens";

// The hash must stay byte-identical to better-auth's internal hasher (unpadded
// base64url SHA-256), or every stored-token lookup silently misses.
test("hashes tokens as unpadded base64url SHA-256, matching better-auth", () => {
	expect(hashOAuthToken("test")).toBe(
		"n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg",
	);
});
