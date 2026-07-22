import {
	CusProductStatus,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isSyntheticPooledBalanceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { type BatchResetCusEntsPayload, workflows } from "@/queue/workflows.js";
import { getResettableCustomerEntitlements } from "./getResettableCustomerEntitlements.js";

export const triggerBatchResetSubjectEntitlements = async ({
	ctx,
	fullSubjects,
}: {
	ctx: AutumnContext;
	fullSubjects: FullSubject[];
}) => {
	const now = Date.now();
	const resets: BatchResetCusEntsPayload["resets"] = [];

	for (const fullSubject of fullSubjects) {
		const customerEntitlements = fullSubjectToCustomerEntitlements({
			fullSubject,
			inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		});
		const cusEntsNeedingReset = getResettableCustomerEntitlements({
			customerEntitlements,
			now,
		});
		const syntheticPooledBalancesNeedingReset = customerEntitlements.filter(
			(customerEntitlement) =>
				customerEntitlement.next_reset_at != null &&
				customerEntitlement.next_reset_at < now &&
				isSyntheticPooledBalanceCustomerEntitlement({
					customerEntitlement,
					customerProduct: customerEntitlement.customer_product,
				}),
		);
		const customerEntitlementsTriggeringReset = [
			...cusEntsNeedingReset,
			...syntheticPooledBalancesNeedingReset,
		];

		if (customerEntitlementsTriggeringReset.length === 0) continue;

		resets.push({
			internalCustomerId: fullSubject.internalCustomerId,
			customerId: fullSubject.customerId,
			internalEntityId: fullSubject.internalEntityId,
			entityId: fullSubject.entityId,
			cusEntIds: customerEntitlementsTriggeringReset.map(
				(customerEntitlement) => customerEntitlement.id,
			),
		});
	}

	if (resets.length === 0) return;

	await workflows.triggerBatchResetCusEnts({
		orgId: ctx.org.id,
		env: ctx.env,
		resets,
	});
};
