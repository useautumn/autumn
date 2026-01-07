import {
	cusProductToProduct,
	InternalError,
	secondsToMs,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/fetch/fetchStripeCustomerForBilling";
import { fetchStripeSubscriptionForBilling } from "@/internal/billing/v2/providers/stripe/fetch/fetchStripeSubscriptionForBilling";
import { fetchStripeSubscriptionScheduleForBilling } from "@/internal/billing/v2/providers/stripe/fetch/fetchStripeSubscriptionScheduleForBilling";
import { CusService } from "../../../../customers/CusService";
import type { UpdateSubscriptionBillingContext } from "../../billingContext";
import { parseFeatureQuantitiesParams } from "../../utils/parseFeatureQuantitiesParams";
import { fetchTargetCusProductForUpdate } from "./fetchTargetCusProductForUpdate";

/**
 * Fetch the context for updating a subscription
 * @param ctx - The context
 * @param body - The body of the request
 * @returns The update subscription context
 */
export const fetchUpdateSubscriptionBillingContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV0Params;
}): Promise<UpdateSubscriptionBillingContext> => {
	const { db, org, env } = ctx;
	const { customer_id: customerId, product_id: productId } = params;

	const fullCustomer = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		withSubs: true,
		withEntities: true,
		entityId: params.entity_id ?? undefined,
	});

	const targetCustomerProduct = fetchTargetCusProductForUpdate({
		params,
		fullCustomer,
	});

	if (!targetCustomerProduct) {
		throw new InternalError({
			message: `[API Subscription Update] Target customer product not found: ${productId}`,
		});
	}

	const fullProduct = cusProductToProduct({
		cusProduct: targetCustomerProduct,
	});

	const stripeSubscription = await fetchStripeSubscriptionForBilling({
		ctx,
		fullCus: fullCustomer,
		products: [],
		targetCusProductId: targetCustomerProduct.id,
	});

	const stripeSubscriptionSchedule =
		await fetchStripeSubscriptionScheduleForBilling({
			ctx,
			fullCus: fullCustomer,
			subscriptionScheduleId:
				typeof stripeSubscription?.schedule === "string"
					? stripeSubscription.schedule
					: undefined,
			products: [],
			targetCusProductId: targetCustomerProduct.id,
		});

	const {
		stripeCus: stripeCustomer,
		paymentMethod,
		testClockFrozenTime,
	} = await fetchStripeCustomerForBilling({
		ctx,
		fullCus: fullCustomer,
	});

	const featureQuantities = parseFeatureQuantitiesParams({
		ctx,
		featureQuantitiesParams: params,
		fullProduct,
		currentCustomerProduct: targetCustomerProduct,
	});

	const currentEpochMs = testClockFrozenTime ?? Date.now();

	const billingCycleAnchorMs = secondsToMs(
		stripeSubscription?.billing_cycle_anchor,
	);

	// Invoice mode
	const invoiceMode =
		params?.invoice === true
			? {
					finalizeInvoice: params.finalize_invoice === true,
					enableProductImmediately: params.enable_product_immediately !== false,
				}
			: undefined;

	return {
		fullCustomer,
		fullProducts: [fullProduct],
		customerProduct: targetCustomerProduct,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeCustomer,
		paymentMethod,

		currentEpochMs,
		billingCycleAnchorMs: billingCycleAnchorMs ?? "now",
		invoiceMode,
		featureQuantities,
	};
};
