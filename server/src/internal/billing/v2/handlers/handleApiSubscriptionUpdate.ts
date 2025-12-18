import {
	cusProductToProduct,
	InternalError,
	SubscriptionUpdateV0ParamsSchema,
	secondsToMs,
} from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { CusService } from "../../../customers/CusService";
import { EntitlementService } from "../../../products/entitlements/EntitlementService";
import { PriceService } from "../../../products/prices/PriceService";
import { cusProductToExistingUsages } from "../../billingUtils/handleExistingUsages/cusProductToExistingUsages";
import { initFullCusProduct } from "../../billingUtils/initFullCusProduct/initFullCusProduct";
import { buildAutumnLineItems } from "../compute/computeAutumnUtils/buildAutumnLineItems";
import { buildStripeSubAction } from "../compute/computeStripeUtils/buildStripeSubAction";
import { executeCusProductActions } from "../execute/executeAutumnActions/executeCusProductActions";
import { executeStripeSubAction } from "../execute/executeStripeSubAction";
import { overrideProduct } from "../fetch/fetchAutumnUtils/overrideProduct";
import { fetchStripeCustomerForAttach } from "../fetch/fetchStripeUtils/fetchStripeCustomerForAttach";
import { fetchStripeSubForAttach } from "../fetch/fetchStripeUtils/fetchStripeSubForAttach";

export const handleApiSubscriptionUpdate = createRoute({
	body: SubscriptionUpdateV0ParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const { db, org, env } = ctx;
		const { customer_id: customerId, product_id: planId } = body;

		// 1. Fetch the context
		/**
		 * const apiSubscriptionUpdateContext = await fetchApiSubscriptionUpdateContext({
				ctx,
				body,
			});
			1. Full customer
			2. Target customer product
			3. Stripe subscription (if applicable)
			4. Stripe schedule (if applicable)
			5. Stripe customer
			6. Payment method (if applicable)
			7. Test clock frozen time (if applicable)
			8. shouldDoUpdateQuantity -- if feature quantities is passed in, and there are no custom items, then we go down update quantity plan, if not do the compute update subscription plan
		 
		*  if (apiSubscriptionUpdateContext.intent === "update_quantity") {
		 *    const updateQuantityPlan = computeUpdateQuantityPlan({ ctx, context });
		 *  } else if (apiSubscriptionUpdateContext.intent === "update_plan") {
		 *    const updatePlanPlan = computeUpdateSubscriptionPlan({ ctx, context });
		 *  }
		 *  await executeBillingPlan({ ctx, plan });
		 */

		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env,
			withSubs: true,
			withEntities: true,
		});

		// 1. Find target customer product
		const targetCusProduct = fullCus.customer_products.find(
			(cp) => cp.product.id === planId,
		);

		if (!targetCusProduct) {
			throw new InternalError({
				message: `[api subscription update] Target cus product not found: ${planId}`,
			});
		}

		const ongoingCusProductAction = {
			action: "expire" as const,
			cusProduct: targetCusProduct,
		};

		const curFullProduct = cusProductToProduct({
			cusProduct: targetCusProduct!,
		});

		const {
			fullProducts: [newFullProduct],
			customPrices,
			customEnts,
		} = await overrideProduct({
			ctx,
			newItems: body.items,
			products: [curFullProduct],
		});

		await EntitlementService.insert({
			db,
			data: customEnts,
		});

		await PriceService.insert({
			db,
			data: customPrices,
		});

		const newCusProduct = initFullCusProduct({
			ctx,
			fullCus,
			initContext: {
				fullCus,
				product: newFullProduct,
				featureQuantities: [],
				replaceables: [],
				existingUsages: cusProductToExistingUsages({
					cusProduct: targetCusProduct,
				}),
			},
		});

		// Get stripe subscription
		const stripeSub = await fetchStripeSubForAttach({
			ctx,
			fullCus,
			products: [],
			targetCusProductId: targetCusProduct.id,
		});

		const { stripeCus, paymentMethod, testClockFrozenTime } =
			await fetchStripeCustomerForAttach({
				ctx,
				fullCus,
			});

		const billingCycleAnchor = secondsToMs(stripeSub?.billing_cycle_anchor);

		// 2. Cases: update feature quantity, update plan entirely
		const autumnLineItems = buildAutumnLineItems({
			ctx,
			newCusProducts: [newCusProduct],
			ongoingCusProductAction,
			billingCycleAnchor,
			testClockFrozenTime,
		});

		const stripeSubAction = buildStripeSubAction({
			ctx,
			stripeSub: stripeSub!,
			fullCus,
			paymentMethod,
			ongoingCusProductAction,
			newCusProducts: [newCusProduct],
		});

		ctx.logger.info("Executing stripe sub action");
		await executeStripeSubAction({
			ctx,
			stripeSubAction,
		});

		ctx.logger.info("Executing cus product actions");
		await executeCusProductActions({
			ctx,
			ongoingCusProductAction,
			newCusProducts: [newCusProduct],
		});

		return c.json({ success: true }, 200);
	},
});

// versionedBody: {
// 	latest: ApiSubscriptionUpdateBodyV1Schema,
// 	[ApiVersion.V2_0]: ApiSubscriptionUpdateBodyV0Schema,
// },
// resource: AffectedResource.ApiSubscriptionUpdate,
// handler: async (c) => {
// 	const ctx = c.get("ctx");
// 	const body = c.req.valid("json");
// },
