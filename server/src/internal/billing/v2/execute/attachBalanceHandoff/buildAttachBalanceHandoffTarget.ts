import {
	type AutumnBillingPlan,
	type FullCustomerEntitlement,
	fullSubjectToFullCustomer,
	InternalError,
	type NormalizedFullSubject,
	normalizedToFullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { copyAttachRuntimeBalanceFields } from "@/internal/billing/v2/actions/attach/setup/overlayAttachRuntimeBalances.js";
import { recomputeAttachTargetFromRuntimeSource } from "./recomputeAttachTargetFromRuntimeSource.js";

export const buildAttachBalanceHandoffTarget = ({
	ctx,
	autumnBillingPlan,
	runtimeNormalized,
	postgresNormalized,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	runtimeNormalized: NormalizedFullSubject;
	postgresNormalized: NormalizedFullSubject;
}): NormalizedFullSubject => {
	const handoff = autumnBillingPlan.attachBalanceHandoff;
	if (!handoff) return postgresNormalized;

	const runtimeFullCustomer = fullSubjectToFullCustomer({
		fullSubject: normalizedToFullSubject({ normalized: runtimeNormalized }),
	});
	const postgresFullCustomer = fullSubjectToFullCustomer({
		fullSubject: normalizedToFullSubject({ normalized: postgresNormalized }),
	});

	const sourceCustomerProduct = runtimeFullCustomer.customer_products.find(
		(customerProduct) => customerProduct.id === handoff.sourceCustomerProductId,
	);
	if (!sourceCustomerProduct) {
		throw new InternalError({
			message: `Could not resolve attach balance handoff source '${handoff.sourceCustomerProductId}'`,
			code: "balance_handoff_source_product_missing",
		});
	}

	const targetCustomerProduct = postgresFullCustomer.customer_products.find(
		(customerProduct) => customerProduct.id === handoff.targetCustomerProductId,
	);
	if (!targetCustomerProduct) {
		throw new InternalError({
			message: `Could not resolve persisted attach balance handoff target '${handoff.targetCustomerProductId}'`,
			code: "balance_handoff_persisted_target_missing",
		});
	}

	const plannedTargetCustomerProduct =
		autumnBillingPlan.insertCustomerProducts.find(
			(customerProduct) =>
				customerProduct.id === handoff.targetCustomerProductId,
		);
	if (!plannedTargetCustomerProduct) {
		throw new InternalError({
			message: `Could not resolve planned attach balance handoff target '${handoff.targetCustomerProductId}'`,
			code: "balance_handoff_planned_target_missing",
		});
	}

	const finalBalanceById = new Map<string, FullCustomerEntitlement>(
		runtimeNormalized.customer_entitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement as unknown as FullCustomerEntitlement,
		]),
	);
	const recomputedTarget = recomputeAttachTargetFromRuntimeSource({
		ctx,
		fullCustomer: postgresFullCustomer,
		sourceCustomerProduct,
		targetCustomerProduct,
		plannedTargetCustomerProduct,
		carryAllConsumableFeatures: handoff.carryAllConsumableFeatures,
		consumableFeatureIdsToCarry: handoff.consumableFeatureIdsToCarry,
	});
	for (const customerEntitlement of recomputedTarget.customer_entitlements) {
		finalBalanceById.set(customerEntitlement.id, customerEntitlement);
	}

	const liveUsageWindowById = new Map(
		runtimeNormalized.usage_windows.map((usageWindow) => [
			usageWindow.id,
			usageWindow,
		]),
	);
	const target = structuredClone(postgresNormalized);
	target.customer_entitlements = target.customer_entitlements.map(
		(subjectBalance): typeof subjectBalance => {
			const runtimeCustomerEntitlement = finalBalanceById.get(
				subjectBalance.id,
			);
			if (!runtimeCustomerEntitlement) return subjectBalance;
			const runtimeFields = copyAttachRuntimeBalanceFields({
				postgresCustomerEntitlement: subjectBalance as FullCustomerEntitlement,
				runtimeCustomerEntitlement,
			});
			return {
				...subjectBalance,
				balance: runtimeFields.balance ?? 0,
				additional_balance: runtimeFields.additional_balance,
				adjustment: runtimeFields.adjustment,
				entities: runtimeFields.entities ?? null,
				replaceables: runtimeFields.replaceables.map((replaceable) => ({
					...replaceable,
					from_entity_id: replaceable.from_entity_id ?? null,
				})),
				rollovers: runtimeFields.rollovers,
			};
		},
	);
	target.usage_windows = target.usage_windows.map(
		(usageWindow) => liveUsageWindowById.get(usageWindow.id) ?? usageWindow,
	);

	return target;
};
