import {
	addCusProductToCusEnt,
	CusProductStatus,
	cusEntToCusPrice,
	EntInterval,
	type FullCusEntWithFullCusProduct,
	secondsToMs,
} from "@autumn/shared";
import { isStripeInvoiceForNewPeriod } from "@/external/stripe/invoices/utils/classifyStripeInvoice";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { stripeSubscriptionToEntInterval } from "@/external/stripe/stripeSubUtils/stripeSubscriptionToEntInterval";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils";
import type { InvoiceCreatedContext } from "../setupInvoiceCreatedContext";

/**
 * Resets free (non-price-backed) customer entitlements whose interval matches
 * the subscription's billing cycle. Aligns their next_reset_at with the
 * subscription period end so they stay in sync with paid entitlements.
 */
export const processFreeEntitlementsForInvoiceCreated = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}): Promise<void> => {
	const { stripeInvoice, stripeSubscription, fullCustomer } = eventContext;

	if (!isStripeInvoiceForNewPeriod(stripeInvoice)) return;

	const subInterval = stripeSubscriptionToEntInterval({ stripeSubscription });
	if (!subInterval) return;

	const { end } = subToPeriodStartEnd({ sub: stripeSubscription });
	const nextResetAt = secondsToMs(end);

	const freeCusEnts = collectMatchingFreeCusEnts({
		fullCustomer,
		subInterval: subInterval.interval,
		subIntervalCount: subInterval.intervalCount,
	});

	if (freeCusEnts.length === 0) return;

	ctx.logger.info(
		`[invoice.created] Resetting ${freeCusEnts.length} free entitlement(s) via webhook`,
	);

	for (const cusEnt of freeCusEnts) {
		const ent = cusEnt.entitlement;

		const resetUpdate = getResetBalancesUpdate({
			cusEnt,
			allowance: ent.allowance ?? 0,
		});

		await CusEntService.update({
			ctx,
			id: cusEnt.id,
			updates: {
				...resetUpdate,
				adjustment: 0,
				next_reset_at: nextResetAt,
			},
		});

		const rolloverUpdate = getRolloverUpdates({
			cusEnt,
			nextResetAt,
		});

		if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
			await RolloverService.insert({
				ctx,
				rows: rolloverUpdate.toInsert,
				fullCusEnt: cusEnt,
			});
		}
	}
};

/**
 * Collects free cusEnts with matching interval, regardless of day alignment.
 * Deliberately broader than the lazy filter — this is the adoption mechanism
 * that brings misaligned free entitlements onto the subscription's cycle.
 */
const collectMatchingFreeCusEnts = ({
	fullCustomer,
	subInterval,
	subIntervalCount,
}: {
	fullCustomer: InvoiceCreatedContext["fullCustomer"];
	subInterval: EntInterval;
	subIntervalCount: number;
}): FullCusEntWithFullCusProduct[] => {
	const result: FullCusEntWithFullCusProduct[] = [];

	for (const cusProduct of fullCustomer.customer_products) {
		if (cusProduct.status !== CusProductStatus.Active) continue;

		for (const cusEnt of cusProduct.customer_entitlements) {
			const ent = cusEnt.entitlement;
			if (!cusEnt.next_reset_at) continue;
			if (ent.interval !== subInterval) continue;
			if ((ent.interval_count ?? 1) !== subIntervalCount) continue;

			const cusEntWithProduct = addCusProductToCusEnt({ cusEnt, cusProduct });
			if (cusEntToCusPrice({ cusEnt: cusEntWithProduct })) continue;

			result.push(cusEntWithProduct);
		}
	}

	return result;
};
