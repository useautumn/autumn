import {
	type AutumnBillingPlan,
	type BillingContext,
	formatMs,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logAutumnBillingPlan = ({
	ctx,
	plan,
	billingContext,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: BillingContext;
}) => {
	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	const formatCustomerProduct = (cp: {
		product_id: string;
		product: { name: string };
	}) => `${cp.product.name} (${cp.product_id})`;

	addToExtraLogs({
		ctx,
		extras: {
			autumnBillingPlan: {
				insertCustomerProducts:
					plan.insertCustomerProducts.map(formatCustomerProduct).join(", ") ||
					"none",

				updateCustomerProduct: plan.updateCustomerProduct
					? {
							product: formatCustomerProduct(
								plan.updateCustomerProduct.customerProduct,
							),
							updates: plan.updateCustomerProduct.updates,
						}
					: "none",

				deleteCustomerProduct: plan.deleteCustomerProduct
					? formatCustomerProduct(plan.deleteCustomerProduct)
					: "none",

				patchCustomerProducts:
					plan.patchCustomerProducts
						?.map(
							(patch) =>
								`${formatCustomerProduct(patch.customerProduct)}: +${patch.insertCustomerEntitlements.length} ent, +${patch.insertCustomerPrices.length} price | -${patch.deleteCustomerEntitlements.length} ent, -${patch.deleteCustomerPrices.length} price`,
						)
						.join(", ") || "none",

				customPrices:
					(plan.customPrices?.length ?? 0) > 0
						? `${plan.customPrices?.length} custom price(s)`
						: "none",

				customEntitlements:
					(plan.customEntitlements?.length ?? 0) > 0
						? `${plan.customEntitlements?.length} custom ent(s)`
						: "none",

				pooledBalanceOps:
					plan.pooledBalanceOps
						?.map((operation) => {
							switch (operation.op) {
								case "upsert_source":
									return `${operation.sourceCustomerProductId}:${operation.featureId}=${operation.currentCycleContribution}`;
								case "remove_source":
									return `${operation.sourceCustomerProductId}:remove${operation.effectiveAt ? `@${operation.effectiveAt}` : ""}`;
								case "remove_contribution":
									return `${operation.sourceCustomerProductId}:${operation.sourceEntitlementId}:remove${operation.effectiveAt ? `@${operation.effectiveAt}` : ""}`;
								case "restore_source":
									return `${operation.sourceCustomerProductId}:restore@${operation.expectedEffectiveAt}`;
								case "transfer_source":
									return `${operation.sourceCustomerProductId}:${operation.featureId}=transfer:${operation.currentCycleContribution}`;
								case "stage_owner_removal":
									return `${operation.resetOwnerType}:${operation.resetOwnerId}:stage@${operation.effectiveAt}`;
								case "restore_owner":
									return `${operation.resetOwnerType}:${operation.resetOwnerId}:restore@${operation.expectedEffectiveAt}`;
							}
							return operation satisfies never;
						})
						.join(", ") || "none",

				trialTransition: `${isTrialing ? "trialing" : "not trialing"} -> ${willBeTrialing ? "will trial" : "no trial"}`,

				updateCustomerEntitlements:
					plan.updateCustomerEntitlements
						?.map((update) => {
							if (update.updates) {
								return `${update.customerEntitlement.feature_id}: ${JSON.stringify(update.updates)}`;
							}

							return `${update.customerEntitlement.feature_id}: ${(update.balanceChange ?? 0) > 0 ? "+" : ""}${update.balanceChange}`;
						})
						.join(", ") || "none",

				lineItems:
					plan.lineItems?.map((item) => ({
						item: `${item.description}: ${item.amountAfterDiscounts}`,
						effectivePeriod: `${formatMs(item.context.effectivePeriod?.start)} - ${formatMs(item.context.effectivePeriod?.end)}`,
					})) ?? "none",

				autoTopupRebalance: plan.autoTopupRebalance
					? plan.autoTopupRebalance.deltas
							.map(
								({ cusEntId, delta }) =>
									`${cusEntId}: ${delta > 0 ? "+" : ""}${delta}`,
							)
							.join(", ") || "no-op"
					: "none",

				oneOffPurchaseRebalance:
					plan.oneOffPurchaseRebalance?.purchases ?? "none",
			},
		},
	});
};
