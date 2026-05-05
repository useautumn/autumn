import {
	ACTIVE_STATUSES,
	type BillingAutoTopupSucceededInvoice,
	type BillingResult,
	fullCustomerToCustomerEntitlements,
	getApiBalance,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { generateId } from "@/utils/genUtils.js";
import type { AutoTopupContext } from "../autoTopupContext.js";

const getInvoicePayload = ({
	billingResult,
}: {
	billingResult: BillingResult;
}): BillingAutoTopupSucceededInvoice | null => {
	const stripeInvoice = billingResult.stripe.stripeInvoice;
	if (!stripeInvoice) return null;

	return {
		stripe_id: stripeInvoice.id,
		status: stripeInvoice.status,
		total: stripeInvoice.total,
		currency: stripeInvoice.currency,
		hosted_invoice_url: stripeInvoice.hosted_invoice_url,
	};
};

// Refetches because executeBillingPlan applied the rebalance via SQL increments;
// the in-memory autoTopupContext.customerEntitlement is now stale.
const getBalanceAfter = async ({
	ctx,
	autoTopupContext,
}: {
	ctx: AutumnContext;
	autoTopupContext: AutoTopupContext;
}): Promise<number> => {
	const feature = autoTopupContext.customerEntitlement.entitlement.feature;
	const customerId =
		autoTopupContext.fullCustomer.id ??
		autoTopupContext.fullCustomer.internal_id;
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ACTIVE_STATUSES,
		withSubs: true,
	});
	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId: feature.id,
	});
	const { data: balance } = getApiBalance({
		ctx,
		fullCus: fullCustomer,
		cusEnts: customerEntitlements,
		feature,
	});

	return balance.remaining;
};

export const sendAutoTopupSucceededWebhook = async ({
	ctx,
	autoTopupContext,
	billingResult,
}: {
	ctx: AutumnContext;
	autoTopupContext: AutoTopupContext;
	billingResult: BillingResult;
}) => {
	try {
		const invoice = getInvoicePayload({ billingResult });
		if (!invoice) {
			ctx.logger.warn(
				"[sendAutoTopupSucceededWebhook] Missing invoice, skipping webhook",
			);
			return;
		}

		const customerId =
			autoTopupContext.fullCustomer.id ??
			autoTopupContext.fullCustomer.internal_id;
		const balanceAfter = await getBalanceAfter({ ctx, autoTopupContext });

		await sendSvixEvent({
			ctx,
			eventType: WebhookEventType.BillingAutoTopupSucceeded,
			payloadFields: {
				id: generateId("evt_auto_topup"),
				occurred_at: Date.now(),
			},
			data: {
				customer_id: customerId,
				feature_id: autoTopupContext.autoTopupConfig.feature_id,
				quantity_granted: autoTopupContext.autoTopupConfig.quantity,
				threshold: autoTopupContext.autoTopupConfig.threshold,
				balance_after: balanceAfter,
				invoice_mode: Boolean(autoTopupContext.invoiceMode),
				invoice,
			},
		});
	} catch (error) {
		ctx.logger.error(
			`[sendAutoTopupSucceededWebhook] Failed to send webhook: ${error}`,
			{ error },
		);
	}
};
