import { CusProductStatus, InvoiceStatus } from "@autumn/shared";
import { pollUntil } from "@tests/utils/genUtils";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const WEBHOOK_EFFECTS_TIMEOUT_MS = 45_000;

const isFailedRenewal = (subscription: Stripe.Subscription) => {
	const invoice = subscription.latest_invoice as Stripe.Invoice | null;
	return invoice?.status === "open" && invoice.attempt_count > 0;
};

/**
 * Waits until Stripe has failed the renewal and Autumn has processed its webhooks:
 * the renewal is stored as open and the product synced to past_due. Returns whether both landed.
 */
export const waitForFailedRenewalWebhookEffects = async ({
	ctx,
	customerId,
	productId,
	subscriptionId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	productId: string;
	subscriptionId: string;
}): Promise<boolean> => {
	const subscription = await pollUntil({
		fetch: () =>
			ctx.stripeCli.subscriptions.retrieve(subscriptionId, {
				expand: ["latest_invoice"],
			}),
		until: isFailedRenewal,
		timeoutMs: WEBHOOK_EFFECTS_TIMEOUT_MS,
	});
	if (!isFailedRenewal(subscription)) return false;
	const renewalInvoiceId = (subscription.latest_invoice as Stripe.Invoice).id!;

	const settled = await pollUntil({
		fetch: async () => {
			const [autumnInvoice, fullCustomer] = await Promise.all([
				InvoiceService.getByStripeId({
					db: ctx.db,
					stripeId: renewalInvoiceId,
				}),
				CusService.getFull({ ctx, idOrInternalId: customerId }),
			]);
			const customerProduct = fullCustomer.customer_products.find(
				(cp) => cp.product.id === productId,
			);
			return (
				autumnInvoice?.status === InvoiceStatus.Open &&
				customerProduct?.status === CusProductStatus.PastDue
			);
		},
		until: (isSettled) => isSettled,
		timeoutMs: WEBHOOK_EFFECTS_TIMEOUT_MS,
	});
	return settled;
};
