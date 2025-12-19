import {
	cusProductToProduct,
	InternalError,
	type SubscriptionUpdateV0Params,
} from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "../../../../customers/CusService";
import { fetchStripeCustomerForBilling } from "../../fetch/fetchStripeUtils/fetchStripeCustomerForBilling";
import { fetchStripeSubscriptionForBilling } from "../../fetch/fetchStripeUtils/fetchStripeSubscriptionForBilling";
import { fetchTargetCusProductForUpdate } from "./fetchTargetCusProductForUpdate";
import type { UpdateSubscriptionContext } from "./updateSubscriptionContextSchema";

/**
 * Fetch the context for updating a subscription
 * @param ctx - The context
 * @param body - The body of the request
 * @returns The update subscription context
 * @example
 * const context = await fetchApiSubscriptionUpdateContext(ctx, params);
 *
 * Returns:
 * 1. Full customer
 * 2. Target customer product
 * 3. Stripe subscription (if applicable)
 * 4. Stripe schedule (if applicable)
 * 5. Stripe customer
 * 6. Payment method (if applicable)
 * 7. Test clock frozen time (if applicable)
 */
export const fetchApiSubscriptionUpdateContext = async (
	ctx: AutumnContext,
	params: SubscriptionUpdateV0Params,
): Promise<UpdateSubscriptionContext> => {
	const { db, org, env } = ctx;
	const { customer_id: customerId, product_id: productId } = params;

	const fullCustomer = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		withSubs: true,
		withEntities: true,
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

	const targetProduct = cusProductToProduct({
		cusProduct: targetCustomerProduct,
	});

	const stripeSubscription = await fetchStripeSubscriptionForBilling({
		ctx,
		fullCus: fullCustomer,
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

	return {
		fullCustomer,
		product: targetProduct,
		customerProduct: targetCustomerProduct,
		stripeSubscription,
		stripeCustomer,
		paymentMethod,
		testClockFrozenTime,
	};
};
