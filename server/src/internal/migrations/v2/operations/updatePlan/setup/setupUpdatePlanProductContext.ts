import {
	BillingVersion,
	type FullCusProduct,
	type FullCustomer,
	orgDisableStripeWrites,
	resolveCustomerCurrency,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { planOffersCurrency } from "@/internal/billing/v2/actions/attach/errors/handleCurrencyMismatchErrors.js";
import { setupUpdateSubscriptionProductContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionProductContext.js";
import { setupAdjustableQuantities } from "@/internal/billing/v2/setup/setupAdjustableQuantities.js";
import { setupAnchorResetRefund } from "@/internal/billing/v2/setup/setupAnchorResetRefund.js";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext.js";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext.js";
import { setupMigrationOperationBillingContext } from "@/internal/migrations/v2/run/migrateCustomer/setup/index.js";
import type { MigrateCustomerContext } from "../../types/index.js";
import { applyPrepareResultsToUpdatePlan } from "../applyPrepareResults/index.js";
import { resolveFeatureQuantityStrategy } from "../compute/resolveFeatureQuantityStrategy.js";
import { itemAlreadyExists } from "./itemAlreadyExists.js";
import type { UpdatePlanProductContext } from "./types.js";

export const setupUpdatePlanProductContext = async ({
	ctx,
	context,
	op,
	opIndex,
	projectedFullCustomer,
	customerProduct,
}: {
	ctx: AutumnContext;
	context: MigrateCustomerContext;
	op: UpdatePlanOp;
	opIndex: number;
	projectedFullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}): Promise<UpdatePlanProductContext | undefined> => {
	const {
		op: preparedOp,
		preparedIds,
		reusePricesAndEntitlements,
	} = applyPrepareResultsToUpdatePlan({
		context,
		op,
		opIndex,
		internalProductId: customerProduct.internal_product_id,
	});

	const addItems = preparedOp.customize?.add_items?.filter(
		(item) =>
			!itemAlreadyExists({
				ctx,
				customerProduct,
				item,
				removeItems: preparedOp.customize?.remove_items,
			}),
	);
	const customize = {
		...preparedOp.customize,
		...(addItems ? { add_items: addItems } : {}),
	};
	const versionToApply =
		preparedOp.version === customerProduct.product.version &&
		!customerProduct.is_custom
			? undefined
			: preparedOp.version;
	if (
		versionToApply === undefined &&
		customize.price === undefined &&
		(customize.add_items === undefined || customize.add_items.length === 0) &&
		customize.remove_items === undefined &&
		(customize.update_items === undefined ||
			customize.update_items.length === 0)
	) {
		return undefined;
	}

	const customerId =
		projectedFullCustomer.id ?? projectedFullCustomer.internal_id;
	const entity = customerProduct.internal_entity_id
		? projectedFullCustomer.entities.find(
				(candidate) =>
					candidate.internal_id === customerProduct.internal_entity_id,
			)
		: undefined;
	const productFullCustomer = entity
		? { ...projectedFullCustomer, entity }
		: projectedFullCustomer;

	const strategyFeatureQuantities = preparedOp.feature_quantities_strategy
		? resolveFeatureQuantityStrategy({
				strategies: preparedOp.feature_quantities_strategy,
				customerProduct,
				addItems: customize.add_items,
			})
		: [];

	const allowCharges = preparedOp.proration === true;

	const params: UpdateSubscriptionV1Params = {
		customer_id: customerId,
		entity_id: customerProduct.entity_id ?? undefined,
		customer_product_id: customerProduct.id,
		plan_id: customerProduct.product.id,
		version: versionToApply,
		...(preparedOp.customize ? { customize } : {}),
		...(strategyFeatureQuantities.length > 0
			? { feature_quantities: strategyFeatureQuantities }
			: {}),
		// Explicitly "none" unless proration is true (internal-only op field,
		// never settable from the frontend) — default migration behavior stays
		// charge-free for every op that doesn't opt in.
		proration_behavior: allowCharges ? undefined : "none",
		no_billing_changes:
			context.migration.no_billing_changes === true ? true : undefined,
	};

	const {
		customerProduct: targetCustomerProduct,
		fullProduct,
		patchContext,
		customPrices,
		customEnts,
	} = await setupUpdateSubscriptionProductContext({
		ctx,
		fullCustomer: productFullCustomer,
		params,
		reusePricesAndEntitlements,
		resetToCatalogVersion: typeof versionToApply === "number",
	});

	const operationBillingContext = await setupMigrationOperationBillingContext({
		ctx,
		context,
		fullCustomer: productFullCustomer,
		customerProduct: targetCustomerProduct,
		fullProduct,
	});

	// A customer billed in a currency the target plan no longer offers stays
	// grandfathered on their current prices instead of failing at Stripe.
	const targetPrices = customPrices?.length ? customPrices : fullProduct.prices;
	const customerCurrency = resolveCustomerCurrency({
		customer: productFullCustomer,
		org: ctx.org,
		stripeCurrency: operationBillingContext.stripeSubscription?.currency,
	});
	if (
		!planOffersCurrency({
			ctx,
			prices: targetPrices,
			currency: customerCurrency,
		})
	) {
		ctx.logger.warn(
			`[migration] skipping customer product ${customerProduct.id}: target plan has no '${customerCurrency}' price`,
		);
		return undefined;
	}

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: params,
		fullProduct,
		currentCustomerProduct: targetCustomerProduct,
		initializeUndefinedQuantities: true,
	});

	const skipBillingChanges =
		orgDisableStripeWrites({ ctx }) ||
		params.no_billing_changes === true ||
		operationBillingContext.stripeSubscription === undefined;

	const invoiceMode = await setupInvoiceModeContext({ ctx, params });
	const billingContext: UpdateSubscriptionBillingContext = {
		intent: UpdateSubscriptionIntent.UpdatePlan,
		fullCustomer: productFullCustomer,
		fullProducts: [fullProduct],
		customerProduct: targetCustomerProduct,
		patchContext,
		recalculateBalances: false,
		stripeSubscription: operationBillingContext.stripeSubscription,
		stripeSubscriptionSchedule:
			operationBillingContext.stripeSubscriptionSchedule,
		stripeDiscounts: operationBillingContext.stripeDiscounts,
		stripeCustomer: operationBillingContext.stripeCustomer,
		paymentMethod: operationBillingContext.paymentMethod,
		currentEpochMs: operationBillingContext.currentEpochMs,
		billingCycleAnchorMs: operationBillingContext.billingCycleAnchorMs,
		resetCycleAnchorMs: operationBillingContext.resetCycleAnchorMs,
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
		requestedProrationBehavior: params.proration_behavior,
		invoiceMode,
		featureQuantities,
		adjustableFeatureQuantities: setupAdjustableQuantities({ params }),
		customPrices,
		customEnts,
		trialContext: operationBillingContext.trialContext,
		isCustom: targetCustomerProduct.is_custom,
		billingVersion: BillingVersion.V2,
		actionSource: "migration",
		skipBillingChanges,
		allowCharges,
		// Preview never creates real Stripe resources — seed placeholder ids
		// instead, same mechanism attach/updateSubscription previews use.
		dryRunStripe: context.preview,
		checkoutMode: null,
		anchorResetRefund: setupAnchorResetRefund({
			billingCycleAnchor: params.billing_cycle_anchor,
			prorationBehavior: params.proration_behavior,
			outgoingCustomerProduct: targetCustomerProduct,
		}),
	};

	return {
		customerProduct: targetCustomerProduct,
		params,
		billingContext,
		preparedIds,
	};
};
