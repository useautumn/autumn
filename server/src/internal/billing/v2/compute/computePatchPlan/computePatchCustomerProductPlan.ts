import {
	type AutumnBillingPlan,
	CusProductStatus,
	EntInterval,
	type FullCustomerEntitlement,
	getCycleEnd,
	isBooleanEntitlement,
	type PooledBalanceOp,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computeSchedulePhaseReplacements } from "@/internal/billing/v2/compute/computeSchedulePhaseReplacements";
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { isPooledSourceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { entitlementToResetCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";
import { initPatchCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initPatchedCustomerProduct";

export const computePatchCustomerProductPlan = ({
	ctx,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	const { fullCustomer, patchContext, trialContext } =
		updateSubscriptionContext;

	if (!patchContext) {
		throw new Error("Patch context is required to compute patch customer plan");
	}

	const {
		finalCustomerProduct,
		customerProductUpdates,
		oneOffPrepaidCarryOverCustomerEntitlements,
	} = initPatchCustomerProduct({
		ctx,
		billingContext: updateSubscriptionContext,
		patchContext,
	});

	const isUpdatingScheduledProduct =
		patchContext.originalCustomerProduct.status === CusProductStatus.Scheduled;

	// Same-row license transitions: outgoing = the pristine original,
	// incoming = the patched working copy (converged pools).
	const customerLicenseTransitions = computeCustomerLicenseTransitions({
		outgoingCustomerProducts: [patchContext.originalCustomerProduct],
		incomingCustomerProducts: [finalCustomerProduct],
		customerLicenseBillingContext:
			updateSubscriptionContext.customerLicenseBillingContext,
	});

	// A scheduled cusProduct hasn't started billing yet, so there's nothing to
	// prorate — its future phase item swap is applied wholesale via
	// schedulePhaseCustomerProductReplacements, not an immediate invoice line.
	const { allLineItems } = isUpdatingScheduledProduct
		? { allLineItems: [] }
		: buildAutumnLineItems({
				ctx,
				newCustomerProducts: [finalCustomerProduct],
				deletedCustomerProduct: patchContext.originalCustomerProduct,
				billingContext: updateSubscriptionContext,
				includeArrearLineItems:
					updateSubscriptionContext.chargeExistingOverages === true,
			});
	const pooledAttachBillingContext = {
		currentCustomerProduct: patchContext.originalCustomerProduct,
		currentEpochMs: updateSubscriptionContext.currentEpochMs,
		fullCustomer,
		planTiming: isUpdatingScheduledProduct
			? ("end_of_cycle" as const)
			: ("immediate" as const),
		requestedBillingCycleAnchor:
			updateSubscriptionContext.requestedBillingCycleAnchor,
		skipBillingChanges: updateSubscriptionContext.skipBillingChanges,
	};
	let preparedCustomerProduct = finalCustomerProduct;
	let patchInsertCustomerEntitlements = patchContext.insertCustomerEntitlements;
	let pooledBalanceOps: PooledBalanceOp[] = [];

	if (patchContext.mode === "new") {
		const preparedPooledSource = computeAttachPooledBalanceOps({
			customerProduct: finalCustomerProduct,
			attachBillingContext: pooledAttachBillingContext,
		});
		preparedCustomerProduct = preparedPooledSource.customerProduct;
		pooledBalanceOps = preparedPooledSource.pooledBalanceOps;
	} else {
		pooledBalanceOps = patchContext.deleteCustomerEntitlements
			.filter((customerEntitlement) =>
				isPooledSourceCustomerEntitlement({
					customerEntitlement,
					customerProduct: patchContext.originalCustomerProduct,
				}),
			)
			.map((customerEntitlement) => ({
				op: "remove_contribution" as const,
				internalCustomerId:
					patchContext.originalCustomerProduct.internal_customer_id,
				sourceCustomerProductId: patchContext.originalCustomerProduct.id,
				sourceEntitlementId: customerEntitlement.entitlement.id,
				effectiveAt: null,
			}));

		const insertedPooledCustomerEntitlements =
			patchContext.insertCustomerEntitlements.filter((customerEntitlement) =>
				isPooledSourceCustomerEntitlement({
					customerEntitlement,
					customerProduct: finalCustomerProduct,
				}),
			);
		if (insertedPooledCustomerEntitlements.length > 0) {
			const preparedInsertions = computeAttachPooledBalanceOps({
				customerProduct: {
					...finalCustomerProduct,
					customer_entitlements: insertedPooledCustomerEntitlements,
				},
				attachBillingContext: pooledAttachBillingContext,
				removeCurrentSource: false,
			});
			pooledBalanceOps.push(...preparedInsertions.pooledBalanceOps);
			const preparedInsertionById = new Map(
				preparedInsertions.customerProduct.customer_entitlements.map(
					(customerEntitlement) => [
						customerEntitlement.id,
						customerEntitlement,
					],
				),
			);
			const prepareCustomerEntitlement = (
				customerEntitlement: FullCustomerEntitlement,
			) =>
				preparedInsertionById.get(customerEntitlement.id) ??
				customerEntitlement;
			patchInsertCustomerEntitlements =
				patchContext.insertCustomerEntitlements.map(prepareCustomerEntitlement);
			preparedCustomerProduct = {
				...finalCustomerProduct,
				customer_entitlements: finalCustomerProduct.customer_entitlements.map(
					prepareCustomerEntitlement,
				),
			};
		}
	}

	const basePlan = {
		customerId: fullCustomer?.id ?? "",
		customPrices: patchContext.customPrices,
		customEntitlements: patchContext.customEntitlements,
		customFreeTrial: trialContext?.customFreeTrial,
		insertPlanLicenses: updateSubscriptionContext.insertPlanLicenses,
		customerLicenseTransitions,
		pooledBalanceOps,
		lineItems: allLineItems,
		insertCustomerEntitlements: oneOffPrepaidCarryOverCustomerEntitlements,
		updateCustomerEntitlements: computeAnchorResetEntitlementUpdates({
			updateSubscriptionContext,
			finalCustomerProduct: preparedCustomerProduct,
		}),
	} satisfies Partial<AutumnBillingPlan>;

	if (patchContext.mode === "new") {
		return {
			...basePlan,
			insertCustomerProducts: [preparedCustomerProduct],
			updateCustomerProduct: isUpdatingScheduledProduct
				? undefined
				: {
						customerProduct: patchContext.originalCustomerProduct,
						updates: {
							status: CusProductStatus.Expired,
							ended_at: Date.now(),
							canceled: true,
							canceled_at: Date.now(),
						},
					},
			deleteCustomerProduct: isUpdatingScheduledProduct
				? patchContext.originalCustomerProduct
				: undefined,
			schedulePhaseCustomerProductReplacements:
				computeSchedulePhaseReplacements({
					oldCustomerProduct: patchContext.originalCustomerProduct,
					newCustomerProduct: preparedCustomerProduct,
				}),
		} satisfies AutumnBillingPlan;
	}

	return {
		...basePlan,
		insertCustomerProducts: [],
		updateCustomerProducts: [
			{
				customerProduct: patchContext.originalCustomerProduct,
				updates: {
					...customerProductUpdates,
					updated_at: Date.now(),
				},
			},
		],
		patchCustomerProducts: [
			{
				customerProduct: patchContext.originalCustomerProduct,
				insertCustomerPrices: patchContext.insertCustomerPrices,
				insertCustomerEntitlements: patchInsertCustomerEntitlements,
				deleteCustomerPrices: patchContext.deleteCustomerPrices,
				deleteCustomerEntitlements: patchContext.deleteCustomerEntitlements,
			},
		],
	} satisfies AutumnBillingPlan;
};

const computeAnchorResetEntitlementUpdates = ({
	updateSubscriptionContext,
	finalCustomerProduct,
}: {
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	finalCustomerProduct: UpdateSubscriptionBillingContext["customerProduct"];
}): AutumnBillingPlan["updateCustomerEntitlements"] => {
	if (updateSubscriptionContext.requestedBillingCycleAnchor !== "now")
		return [];

	return finalCustomerProduct.customer_entitlements
		.filter((customerEntitlement) => {
			const { entitlement } = customerEntitlement;
			return (
				!isBooleanEntitlement({ entitlement }) && entitlement.allowance !== null
			);
		})
		.map((customerEntitlement) => ({
			customerEntitlement,
			updates: {
				reset_cycle_anchor: entitlementToResetCycleAnchor({
					entitlement: customerEntitlement.entitlement,
					resetCycleAnchor: updateSubscriptionContext.resetCycleAnchorMs,
					now: updateSubscriptionContext.currentEpochMs,
				}),
				next_reset_at: getCycleEnd({
					anchor: updateSubscriptionContext.resetCycleAnchorMs,
					interval:
						customerEntitlement.entitlement.interval ?? EntInterval.Month,
					intervalCount: customerEntitlement.entitlement.interval_count,
					now: updateSubscriptionContext.currentEpochMs,
				}),
			},
		}));
};
