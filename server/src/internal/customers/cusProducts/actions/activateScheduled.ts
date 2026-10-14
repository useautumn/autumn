import {
	AttachScenario,
	CusProductStatus,
	type CustomerProductUpdate,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { computeLicensePooledBalancePlan } from "@/internal/billing/v2/pooledBalances/compute/computeLicensePooledBalancePlan";
import { resolveCarryOverUsagesParam } from "@/internal/billing/v2/utils/handleCarryOvers/resolveCarryOverUsagesParam";
import { findTransitionSourceCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/findTransitionSourceCustomerProduct";
import { reapplyExistingRolloversToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingRolloversToCustomerProduct";
import { reapplyExistingUsagesToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingUsagesToCustomerProduct";

export const activateScheduledCustomerProduct = async ({
	ctx,
	fromCustomerProduct,
	customerProduct,
	fullCustomer,
	subscriptionIds,
	scheduledIds,
	activatedAt,
	emitsBillingUpdated = false,
}: {
	ctx: AutumnContext;
	fromCustomerProduct?: FullCusProduct;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	subscriptionIds?: string[];
	scheduledIds?: string[];
	activatedAt: number;
	emitsBillingUpdated?: boolean;
}): Promise<{
	updates: Partial<InsertCustomerProduct>;
	allocationsAdjusted: boolean;
}> => {
	const { org, env, logger } = ctx;

	logger.info(
		`[activateScheduledCustomerProduct] Activating ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
	);
	const transitionSource =
		fromCustomerProduct ??
		findTransitionSourceCustomerProduct({ fullCustomer, customerProduct });

	await reapplyExistingUsagesToCustomerProduct({
		ctx,
		fromCustomerProduct: transitionSource,
		customerProduct,
		fullCustomer,
	});

	await reapplyExistingRolloversToCustomerProduct({
		ctx,
		fromCustomerProduct: transitionSource,
		customerProduct,
		fullCustomer,
	});

	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.Active,
		subscription_ids: subscriptionIds,
		scheduled_ids: scheduledIds,
		starts_at: Math.min(customerProduct.starts_at, activatedAt),
	};
	const customerLicenseTransitions = transitionSource
		? computeCustomerLicenseTransitions({
				outgoingCustomerProducts: [transitionSource],
				incomingCustomerProducts: [customerProduct],
				carryOverUsages: await resolveCarryOverUsagesParam({
					ctx,
					carryOverUsages: undefined,
				}),
			})
		: [];
	const pooledBalancePlan = customerLicenseTransitions.length
		? computeLicensePooledBalancePlan({
				ctx,
				fullCustomer,
				parentCustomerProduct: customerProduct,
				customerLicenseTransitions,
				now: activatedAt,
			})
		: undefined;

	const { allocationsAdjusted = false } = await executeAutumnBillingPlan({
		ctx,
		emitsBillingUpdated,
		autumnBillingPlan: {
			customerId: fullCustomer.id || fullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts: [
				{
					customerProduct,
					updates: updates as CustomerProductUpdate["updates"],
				},
			],
			pooledBalancePlan,
			customerLicenseTransitions,
		},
	});

	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.New,
		cusProduct: customerProduct,
	});

	return { updates, allocationsAdjusted };
};
