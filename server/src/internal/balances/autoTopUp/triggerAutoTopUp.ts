import {
	cusEntsToCurrentBalance,
	type Feature,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { workflows } from "@/queue/workflows.js";

/** Lightweight pre-check + SQS enqueue for auto top-ups after a deduction. */
export const triggerAutoTopUp = async ({
	ctx,
	newFullCus,
	feature,
}: {
	ctx: AutumnContext;
	newFullCus: FullCustomer;
	feature: Feature;
}) => {
	const { org, env } = ctx;

	// 1. Find matching auto_topup config for this feature
	const autoTopupConfig = newFullCus.auto_topup?.find(
		(config) => config.feature_id === feature.id && config.enabled,
	);

	if (!autoTopupConfig) {
		return;
	}

	// 2. Check if balance is below threshold
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer: newFullCus,
		featureId: feature.id,
	});

	if (cusEnts.length === 0) {
		return;
	}

	const remainingBalance = cusEntsToCurrentBalance({ cusEnts });

	if (remainingBalance >= autoTopupConfig.threshold) {
		return;
	}

	// 3. Enqueue the auto top-up job
	const customerId = newFullCus.id || newFullCus.internal_id;

	await workflows.triggerAutoTopUp({
		orgId: org.id,
		env,
		customerId,
		featureId: feature.id,
	});
};
