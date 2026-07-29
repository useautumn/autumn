/**
 * TDD test locking the core dual-auth invariant: when an org has BOTH a secret
 * key AND an OAuth account for an env, createStripeCli MUST build the client from
 * the secret key — never the master/platform (OAuth) path.
 *
 * Contract under test:
 *   createStripeCli({ org, env }) with both channels present ->
 *     constructs `new Stripe(<decrypted secret key>)` WITHOUT a stripeAccount header
 *     (the stripeAccount header is the tell-tale of the master/OAuth path).
 */

import { describe, expect, mock, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";

const constructed: Array<{ key: string; opts: { stripeAccount?: string } }> =
	[];

mock.module("stripe", () => ({
	default: class FakeStripe {
		constructor(key: string, opts: { stripeAccount?: string } = {}) {
			constructed.push({ key, opts });
		}
	},
}));

mock.module("@server/utils/otel/instrumentStripe.js", () => ({
	instrumentStripe: ({ client }: { client: unknown }) => client,
}));

const { createStripeCli } = await import(
	"@server/external/connect/createStripeCli.js"
);
const { encryptData } = await import("@server/utils/encryptUtils.js");

const buildBothOrg = (): Organization =>
	({
		id: "org_priority",
		slug: "priority",
		master: null,
		stripe_config: { test_api_key: encryptData("sk_test_priority") },
		test_stripe_connect: { account_id: "acct_oauth" },
		live_stripe_connect: {},
	}) as unknown as Organization;

describe("dual-auth: createStripeCli prefers secret key when both present", () => {
	test("builds the secret-key client with no stripeAccount header", () => {
		constructed.length = 0;

		createStripeCli({
			org: buildBothOrg(),
			env: AppEnv.Sandbox,
			skipInstrumentation: true,
		});

		expect(constructed).toHaveLength(1);
		expect(constructed[0].key).toBe("sk_test_priority");
		// Master/OAuth path sets stripeAccount; secret-key path must not.
		expect(constructed[0].opts.stripeAccount).toBeUndefined();
	});
});
