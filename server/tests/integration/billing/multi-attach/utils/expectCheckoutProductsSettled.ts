import type { AppEnv, Organization } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import type { AutumnInt } from "@/external/autumn/autumnCli";
import { createStripeCli } from "@/external/connect/createStripeCli.js";

/** Stripe Checkout URLs embed the session id in the path (…/c/pay/cs_test_…). */
const CHECKOUT_SESSION_ID_PATTERN = /cs_[A-Za-z0-9]+/;

/**
 * Stripe's own view of the session. Separates "the browser never completed the
 * form" (status open / payment_status unpaid) from "Stripe took the money but
 * checkout.session.completed never materialised the products in Autumn"
 * (status complete, yet the customer has no products) — indistinguishable from
 * the assertion message alone, and µVM server errors are invisible to the
 * orchestrator.
 */
const describeCheckoutSession = async ({
	org,
	env,
	paymentUrl,
}: {
	org: Organization;
	env: AppEnv;
	paymentUrl?: string;
}): Promise<string> => {
	const sessionId = paymentUrl?.match(CHECKOUT_SESSION_ID_PATTERN)?.[0];
	if (!sessionId) {
		return `no checkout session id in payment_url: ${paymentUrl ?? "undefined"}`;
	}

	try {
		const stripeCli = createStripeCli({ org, env });
		const session = await stripeCli.checkout.sessions.retrieve(sessionId);
		return [
			`session ${sessionId}`,
			`status=${session.status}`,
			`payment_status=${session.payment_status}`,
			`subscription=${JSON.stringify(session.subscription)}`,
			`invoice=${JSON.stringify(session.invoice)}`,
		].join(", ");
	} catch (error) {
		return `session ${sessionId}: retrieve failed (${error})`;
	}
};

/**
 * Poll until a completed checkout's products land in Autumn.
 *
 * Materialisation is webhook-gated (checkout.session.completed → Stripe → the
 * shared ingress sandbox → the µVM, with Stripe's own retry backoff on a miss),
 * so it needs the webhook ceiling rather than a blind post-checkout sleep. On
 * failure the Stripe-side session state is appended to the message.
 */
export const expectCheckoutProductsSettled = async ({
	org,
	env,
	autumn,
	customerId,
	paymentUrl,
	active,
}: {
	org: Organization;
	env: AppEnv;
	autumn: AutumnInt;
	customerId: string;
	paymentUrl?: string;
	active: string[];
}): Promise<void> => {
	try {
		await expectCustomerProducts({
			customerId,
			autumn,
			active,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});
	} catch (error) {
		const detail = await describeCheckoutSession({ org, env, paymentUrl });
		throw new Error(
			`${error instanceof Error ? error.message : String(error)}\n[stripe checkout] ${detail}`,
		);
	}
};
