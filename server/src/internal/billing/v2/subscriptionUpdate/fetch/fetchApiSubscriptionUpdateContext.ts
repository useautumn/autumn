import { InternalError, type SubscriptionUpdateV0Params } from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/fetch/fetchStripeCustomerForBilling";
import { fetchStripeSubscriptionForBilling } from "@/internal/billing/v2/providers/stripe/fetch/fetchStripeSubscriptionForBilling";
import { fetchStripeSubscriptionScheduleForBilling } from "@/internal/billing/v2/providers/stripe/fetch/fetchStripeSubscriptionScheduleForBilling";
import { CusService } from "../../../../customers/CusService";
import { parseFeatureQuantitiesParams } from "../../utils/parseFeatureQuantitiesParams";
import { fetchTargetCusProductForUpdate } from "./fetchTargetCusProductForUpdate";
import type { UpdateSubscriptionContext } from "./updateSubscriptionContextSchema";

/**
 * Fetch the context for updating a subscription
 * @param ctx - The context
 * @param body - The body of the request
 * @returns The update subscription context
 */
export const fetchApiSubscriptionUpdateContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SubscriptionUpdateV0Params;
}): Promise<UpdateSubscriptionContext> => {
	const { db, org, env, features } = ctx;
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

	if (params.options) {
		params.options = parseFeatureQuantitiesParams({
			optionsInput: params.options,
			features,
			prices: targetCustomerProduct.customer_prices.map((cp) => cp.price),
			currentCustomerProduct: targetCustomerProduct,
		});
	}

	return {
		fullCustomer,
		fullProducts: [],
		customerProduct: targetCustomerProduct,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeCustomer,
		paymentMethod,
		testClockFrozenTime,
		currentEpochMs: testClockFrozenTime ?? Date.now(),
	};
};
