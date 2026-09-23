import { expect, test } from "bun:test";
import {
	isOAuthToken,
	prefixOAuthToken,
	stripOAuthTokenPrefix,
} from "@autumn/auth";
import { assertSandboxTarget } from "../../../../../packages/atmn/src/env/assertSandboxTarget";

test("OAuth prefixes preserve the opaque token and distinguish environments", () => {
	for (const [env, prefix] of [
		["sandbox", "am_sk_test_oauth_"],
		["live", "am_sk_live_oauth_"],
		[null, "am_oauth_"],
	] as const) {
		const token = prefixOAuthToken({ token: "opaque", env });
		expect(token).toBe(`${prefix}opaque`);
		expect(isOAuthToken({ token })).toBe(true);
		expect(stripOAuthTokenPrefix({ token })).toBe("opaque");
		expect(prefixOAuthToken({ token, env })).toBe(token);
	}
	for (const token of ["opaque", "am_sk_test_regular", "am_sk_live_regular"]) {
		expect(isOAuthToken({ token })).toBe(false);
		expect(stripOAuthTokenPrefix({ token })).toBe(token);
	}
});

test("the unchanged CLI reset guard accepts sandbox OAuth and rejects live OAuth", () => {
	const previous = process.env.AUTUMN_SECRET_KEY;
	const target = {
		secretKeyName: "AUTUMN_SECRET_KEY",
		clientId: "cli",
	} as const;
	try {
		process.env.AUTUMN_SECRET_KEY = prefixOAuthToken({
			token: "opaque",
			env: "sandbox",
		});
		expect(() => assertSandboxTarget({ target })).not.toThrow();
		process.env.AUTUMN_SECRET_KEY = prefixOAuthToken({
			token: "opaque",
			env: "live",
		});
		expect(() => assertSandboxTarget({ target })).toThrow("live key");
	} finally {
		if (previous === undefined) delete process.env.AUTUMN_SECRET_KEY;
		else process.env.AUTUMN_SECRET_KEY = previous;
	}
});
