import { InternalError, type SubscriptionUpdateV0Params } from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mapOptionsList } from "@/internal/customers/attach/attachUtils/mapOptionsList";
import { CusService } from "../../../../customers/CusService";
import { fetchStripeCustomerForBilling } from "../../fetch/fetchStripeUtils/fetchStripeCustomerForBilling";
import { fetchStripeSubscriptionForBilling } from "../../fetch/fetchStripeUtils/fetchStripeSubscriptionForBilling";
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
	});

	const targetCustomerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === productId,
	);

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

	if (!stripeSubscription) {
		throw new InternalError({
			message: `[API Subscription Update] No active subscription found for customer product: ${productId}`,
		});
	}

	const {
		stripeCus: stripeCustomer,
		paymentMethod,
		testClockFrozenTime,
	} = await fetchStripeCustomerForBilling({
		ctx,
		fullCus: fullCustomer,
	});

	if (params.options) {
		params.options = mapOptionsList({
			optionsInput: params.options,
			features,
			prices: targetCustomerProduct.customer_prices.map((cp) => cp.price),
			curCusProduct: targetCustomerProduct,
		});
	}

	return {
		fullCustomer,
		customerProduct: targetCustomerProduct,
		stripeSubscription,
		stripeCustomer,
		paymentMethod,
		testClockFrozenTime,
	};
};
