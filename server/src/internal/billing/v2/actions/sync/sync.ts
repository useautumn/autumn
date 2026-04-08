import {
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomizePlanV1,
	ErrCode,
	type FeatureOptions,
	type FullCustomer,
	findFeatureByIdOrInternalId,
	isPrepaidPrice,
	RecaseError,
	type SyncParamsV0,
	secondsToMs,
} from "@autumn/shared";
import { productItemsToCustomizePlanV1 } from "@shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { stripeSubscriptionToAutumnStatus } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupAttachTransitionContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachTransitionContext";
import { setupCustomFullProduct } from "@/internal/billing/v2/setup/setupCustomFullProduct";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { ProductService } from "@/internal/products/ProductService";
import { initSubscriptionFromStripe } from "@/internal/subscriptions/utils/initSubscriptionFromStripe";
import { executeAutumnBillingPlan } from "../../execute/executeAutumnBillingPlan";
import {
	getCancelFieldsFromStripe,
	getTrialEndsAtFromStripe,
} from "./utils/initSyncFromStripe";

export const sync = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SyncParamsV0;
}) => {
	const { org, env } = ctx;

	// 1. Load full customer
	let fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: params.customer_id,
		withSubs: true,
		withEntities: true,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new RecaseError({
			message: "Customer has no linked Stripe customer",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const stripeCli = createStripeCli({ org, env });
	const results: Array<{ plan_id: string; success: boolean; error?: string }> =
		[];

	// 2. Process each mapping
	for (const mapping of params.mappings) {
		try {
			// Refresh full customer after each mapping so subsequent mappings see updates
			fullCustomer = await CusService.getFull({
				ctx,
				idOrInternalId: params.customer_id,
				withSubs: true,
				withEntities: true,
			});

			await processSyncMapping({
				ctx,
				stripeCli,
				fullCustomer,
				mapping,
			});

			results.push({ plan_id: mapping.plan_id, success: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			ctx.logger.error(
				`billing.sync mapping failed for ${mapping.plan_id}: ${error}`,
			);
			results.push({
				plan_id: mapping.plan_id,
				success: false,
				error: message,
			});
		}
	}

	// 3. Clear customer cache
	await deleteCachedFullCustomer({
		ctx,
		customerId: params.customer_id,
		source: "billing.sync",
	});

	return { results };
};

const processSyncMapping = async ({
	ctx,
	stripeCli,
	fullCustomer,
	mapping,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	fullCustomer: FullCustomer;
	mapping: SyncParamsV0["mappings"][number];
}) => {
	const { db, org, env } = ctx;

	// 1. Retrieve the Stripe subscription
	const stripeSubscription = await stripeCli.subscriptions.retrieve(
		mapping.stripe_subscription_id,
		{ expand: ["items.data"] },
	);

	// 2. Load the target Autumn product
	const fullProduct = await ProductService.getFull({
		db,
		idOrInternalId: mapping.plan_id,
		orgId: org.id,
		env,
		logger: ctx.logger,
	});

	// 3. Apply custom items if provided
	let customizePlan: CustomizePlanV1 | undefined;
	if (mapping.items && mapping.items.length > 0) {
		customizePlan = productItemsToCustomizePlanV1({
			ctx,
			items: mapping.items,
		});
	}

	const {
		fullProduct: finalProduct,
		customPrices,
		customEnts,
	} = await setupCustomFullProduct({
		ctx,
		currentFullProduct: fullProduct,
		customizePlan,
	});

	// 4. Find transition context (current cusProduct to expire)
	const { currentCustomerProduct } = setupAttachTransitionContext({
		fullCustomer,
		attachProduct: finalProduct,
	});

	// 5. Build init context from Stripe subscription state
	const currentEpochMs = Date.now();

	const trialEndsAt = getTrialEndsAtFromStripe({ stripeSubscription });

	const { canceledAt, endedAt } = getCancelFieldsFromStripe({
		stripeSubscription,
	});

	const resetCycleAnchorMs = secondsToMs(
		stripeSubscription.billing_cycle_anchor,
	);

	// Init prepaid feature quantities
	const featureQuantities: FeatureOptions[] = [];
	for (const price of finalProduct.prices) {
		if (!isPrepaidPrice(price)) continue;

		const feature = findFeatureByIdOrInternalId({
			features: ctx.features,
			featureIdOrInternalId: price.config.feature_id,
		});
		if (!feature) continue;

		featureQuantities.push({
			feature_id: feature.id,
			internal_feature_id: feature.internal_id,
			quantity: 0,
		});
	}

	// 6. Init the new customer product
	const newCusProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct: finalProduct,
			featureQuantities,
			resetCycleAnchor: resetCycleAnchorMs,
			now: currentEpochMs,
			freeTrial: null,
			trialEndsAt,
		},
		initOptions: {
			subscriptionId: stripeSubscription.id,
			isCustom: Boolean(customizePlan),
			canceledAt,
			endedAt,
			startsAt: stripeSubscription?.start_date
				? secondsToMs(stripeSubscription.start_date)
				: undefined,
			keepSubscriptionIds: true,
			status: stripeSubscriptionToAutumnStatus({
				stripeStatus: stripeSubscription.status,
			}),
		},
	});

	// 7. Build the Autumn billing plan
	const autumnBillingPlan: AutumnBillingPlan = {
		customerId: fullCustomer.id!,
		insertCustomerProducts: [newCusProduct],
		customPrices: customPrices.length > 0 ? customPrices : undefined,
		customEntitlements: customEnts.length > 0 ? customEnts : undefined,

		// Expire the current customer product if requested
		updateCustomerProduct:
			mapping.expire_previous && currentCustomerProduct
				? {
						customerProduct: currentCustomerProduct,
						updates: {
							status: CusProductStatus.Expired,
							ended_at: currentEpochMs,
							canceled: true,
							canceled_at: currentEpochMs,
						},
					}
				: undefined,

		upsertSubscription: initSubscriptionFromStripe({
			ctx,
			stripeSubscription,
		}),
	};

	// 8. Execute (DB only — no Stripe changes)
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan,
	});
};
