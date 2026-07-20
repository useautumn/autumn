import {
	AttachScenario,
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomerProductUpdate,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { isPooledSourceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { findTransitionSourceCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/findTransitionSourceCustomerProduct";
import { reapplyExistingRolloversToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingRolloversToCustomerProduct";
import { reapplyExistingUsagesToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingUsagesToCustomerProduct";

export type PreparedScheduledCustomerProductActivation = {
	customerProduct: FullCusProduct;
	updates: Partial<InsertCustomerProduct>;
	autumnBillingPlan: AutumnBillingPlan;
};

export const prepareScheduledCustomerProductActivation = async ({
	ctx,
	fromCustomerProduct,
	customerProduct,
	fullCustomer,
	subscriptionIds,
	scheduledIds,
	currentEpochMs = Date.now(),
}: {
	ctx: AutumnContext;
	fromCustomerProduct?: FullCusProduct;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	subscriptionIds?: string[];
	scheduledIds?: string[];
	currentEpochMs?: number;
}): Promise<PreparedScheduledCustomerProductActivation> => {
	ctx.logger.info(
		`[activateScheduledCustomerProduct] Activating ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
	);
	const transitionSource =
		fromCustomerProduct ??
		findTransitionSourceCustomerProduct({ fullCustomer, customerProduct });
	const usageSourceCustomerProduct =
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
	};
	const customerLicenseTransitions = transitionSource
		? computeCustomerLicenseTransitions({
				outgoingCustomerProducts: [transitionSource],
				incomingCustomerProducts: [customerProduct],
			})
		: [];
	const activationCustomerProduct: FullCusProduct = {
		...customerProduct,
		status: CusProductStatus.Active,
		subscription_ids: subscriptionIds ?? customerProduct.subscription_ids,
		scheduled_ids: scheduledIds ?? customerProduct.scheduled_ids,
	};
	const { customerProduct: preparedCustomerProduct, pooledBalanceOps } =
		computeAttachPooledBalanceOps({
			customerProduct: activationCustomerProduct,
			attachBillingContext: {
				billingStartsAt: customerProduct.starts_at,
				currentCustomerProduct: usageSourceCustomerProduct,
				currentEpochMs,
				fullCustomer,
				planTiming: "immediate",
				requestedBillingCycleAnchor: undefined,
				skipBillingChanges: false,
			},
			removeCurrentSource: false,
		});
	const updateCustomerEntitlements = customerProduct.customer_entitlements
		.map((customerEntitlement) => {
			if (
				!isPooledSourceCustomerEntitlement({
					customerEntitlement,
					customerProduct: activationCustomerProduct,
				})
			)
				return undefined;
			const preparedCustomerEntitlement =
				preparedCustomerProduct.customer_entitlements.find(
					(candidate) => candidate.id === customerEntitlement.id,
				);
			if (!preparedCustomerEntitlement) return undefined;

			return {
				customerEntitlement,
				updates: {
					balance: preparedCustomerEntitlement.balance ?? 0,
					adjustment: preparedCustomerEntitlement.adjustment ?? 0,
					additional_balance:
						preparedCustomerEntitlement.additional_balance ?? 0,
					entities: preparedCustomerEntitlement.entities ?? undefined,
				},
			};
		})
		.filter((update) => update !== undefined);

	return {
		customerProduct,
		updates,
		autumnBillingPlan: {
			customerId: fullCustomer.id || fullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts: [
				{
					customerProduct,
					updates: updates as CustomerProductUpdate["updates"],
				},
			],
			customerLicenseTransitions,
			pooledBalanceOps,
			updateCustomerEntitlements,
		},
	};
};

export const completeScheduledCustomerProductActivation = async ({
	ctx,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<void> => {
	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org: ctx.org,
		env: ctx.env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.New,
		cusProduct: customerProduct,
	});
};

/** Activates a scheduled customer product and returns its tracking updates. */
export const activateScheduledCustomerProduct = async ({
	ctx,
	fromCustomerProduct,
	customerProduct,
	fullCustomer,
	subscriptionIds,
	scheduledIds,
	currentEpochMs = Date.now(),
}: {
	ctx: AutumnContext;
	fromCustomerProduct?: FullCusProduct; // for cases where expiry happens before activation (eg. expireAndActivateDefault)
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	subscriptionIds?: string[];
	scheduledIds?: string[];
	currentEpochMs?: number;
}): Promise<{ updates: Partial<InsertCustomerProduct> }> => {
	const preparedActivation = await prepareScheduledCustomerProductActivation({
		ctx,
		fromCustomerProduct,
		customerProduct,
		fullCustomer,
		subscriptionIds,
		scheduledIds,
		currentEpochMs,
	});

	// Executing through the shared plan runs the license lifecycle for
	// activations that bring license-bearing parents live.
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: preparedActivation.autumnBillingPlan,
	});

	await completeScheduledCustomerProductActivation({
		ctx,
		customerProduct,
		fullCustomer,
	});

	return { updates: preparedActivation.updates };
};
