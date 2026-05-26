import {
	BillingVersion,
	type FullCusProduct,
	type FullCustomer,
	hasCustomItems,
	orgDisableStripeWrites,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupUpdateSubscriptionProductContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionProductContext.js";
import { setupAdjustableQuantities } from "@/internal/billing/v2/setup/setupAdjustableQuantities.js";
import { setupAnchorResetRefund } from "@/internal/billing/v2/setup/setupAnchorResetRefund.js";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext.js";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext.js";
import { setupMigrationOperationBillingContext } from "@/internal/migrations/v2/run/migrateCustomer/setup/index.js";
import type { MigrateCustomerContext } from "../../types/index.js";
import { applyPrepareResultsToUpdatePlan } from "../applyPrepareResults/index.js";
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
	if (
		preparedOp.version === undefined &&
		customize.price === undefined &&
		customize.add_items?.length === 0 &&
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

	const params: UpdateSubscriptionV1Params = {
		customer_id: customerId,
		entity_id: customerProduct.entity_id ?? undefined,
		customer_product_id: customerProduct.id,
		plan_id: customerProduct.product.id,
		version: preparedOp.version,
		...(preparedOp.customize ? { customize } : {}),
		proration_behavior: "none",
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
	});

	const operationBillingContext = await setupMigrationOperationBillingContext({
		ctx,
		context,
		fullCustomer: productFullCustomer,
		customerProduct: targetCustomerProduct,
		fullProduct,
	});

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
		invoiceMode: setupInvoiceModeContext({ params }),
		featureQuantities,
		adjustableFeatureQuantities: setupAdjustableQuantities({ params }),
		customPrices,
		customEnts,
		trialContext: operationBillingContext.trialContext,
		isCustom: hasCustomItems(params.customize),
		billingVersion: BillingVersion.V2,
		actionSource: "migration",
		skipBillingChanges,
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
