import { setTimeout as delay } from "node:timers/promises";
import { checkoutSessionIdFromUrl } from "../stripeUtils/waitForStripeWebhook";
import type { TestContext } from "../testInitUtils/createTestContext";

export const waitForSetupPaymentMethod = async ({
	ctx,
	url,
	timeoutMs = 30_000,
}: {
	ctx: Pick<TestContext, "stripeCli">;
	url: string;
	timeoutMs?: number;
}) => {
	const deadline = Date.now() + timeoutMs;
	const session = await ctx.stripeCli.checkout.sessions.retrieve(
		checkoutSessionIdFromUrl(url),
		{ expand: ["customer"] },
	);
	if (!session.customer) throw new Error("Setup checkout has no customer");
	let customer =
		typeof session.customer === "string"
			? await ctx.stripeCli.customers.retrieve(session.customer)
			: session.customer;

	for (;;) {
		if (customer.deleted)
			throw new Error("Setup checkout customer was deleted");
		if (customer.invoice_settings.default_payment_method) return;
		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) {
			throw new Error(
				"Setup checkout confirmed, but its customer still has no default payment method",
			);
		}
		// Clock advancement prevents the webhook from applying the default payment method.
		await delay(Math.min(500, remainingMs));
		customer = await ctx.stripeCli.customers.retrieve(customer.id);
	}
};
