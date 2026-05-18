import {
	CusProductStatus,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { type BatchResetCusEntsPayload, workflows } from "@/queue/workflows.js";
import { getWebhookOwnedIntervals } from "../resetCustomerEntitlements/getWebhookOwnedIntervals.js";
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
		const webhookOwnedIntervals = getWebhookOwnedIntervals({
			customerProducts: fullSubject.customer_products,
		});
		const cusEntsNeedingReset = getResettableCustomerEntitlements({
			customerEntitlements,
			now,
			webhookOwnedIntervals,
		});

		if (cusEntsNeedingReset.length === 0) continue;

		resets.push({
			internalCustomerId: fullSubject.internalCustomerId,
			customerId: fullSubject.customerId,
			internalEntityId: fullSubject.internalEntityId,
			entityId: fullSubject.entityId,
			cusEntIds: cusEntsNeedingReset.map((cusEnt) => cusEnt.id),
		});
	}

	if (resets.length === 0) return;

	await workflows.triggerBatchResetCusEnts({
		orgId: ctx.org.id,
		env: ctx.env,
		resets,
	});
};
