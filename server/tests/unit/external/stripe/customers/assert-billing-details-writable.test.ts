import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { assertBillingDetailsWritable } from "@/external/stripe/customers/billingDetails/utils/assertBillingDetailsWritable.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const ctxWith = ({
	env,
	disableStripeWrites,
}: {
	env: AppEnv;
	disableStripeWrites: boolean;
}) =>
	({
		env,
		org: { config: { disable_stripe_writes: disableStripeWrites } },
	}) as unknown as AutumnContext;

test("rejects billing details when the org disables Stripe writes", () => {
	expect(() =>
		assertBillingDetailsWritable({
			ctx: ctxWith({ env: AppEnv.Live, disableStripeWrites: true }),
		}),
	).toThrow("Stripe writes are disabled");
});

test("allows billing details when Stripe writes are enabled or in sandbox", () => {
	expect(() =>
		assertBillingDetailsWritable({
			ctx: ctxWith({ env: AppEnv.Live, disableStripeWrites: false }),
		}),
	).not.toThrow();
	expect(() =>
		assertBillingDetailsWritable({
			ctx: ctxWith({ env: AppEnv.Sandbox, disableStripeWrites: true }),
		}),
	).not.toThrow();
});
