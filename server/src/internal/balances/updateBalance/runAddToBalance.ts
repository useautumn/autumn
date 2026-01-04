import {
	FeatureNotFoundError,
	type SortCusEntParams,
	type UpdateBalanceParams,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { runDeductionTx } from "../track/trackUtils/runDeductionTx.js";

/**
 * Coordinates adding to a balance in both Redis and Postgres
 *
 * Uses negative deduction to add to balance atomically.
 * Requires params.add_to_balance to be set.
 */
export const runAddToBalance = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParams;
}) => {
	const { features } = ctx;
	const {
		customer_id: customerId,
		entity_id: entityId,
		feature_id: featureId,
		add_to_balance: amountToAdd,
		customer_entitlement_id: cusEntId,
	} = params;

	// Look up feature
	const feature = features.find((f) => f.id === featureId);
	if (!feature) {
		throw new FeatureNotFoundError({ featureId });
	}

	// amountToAdd is required for this function
	if (amountToAdd === undefined) {
		throw new Error("add_to_balance is required for runAddToBalance");
	}

	// For add_to_balance, we use Postgres-first approach since it uses
	// negative deduction which is different from syncMode.
	// The refreshCache: true will invalidate Redis cache after Postgres update.
	const sortParams: SortCusEntParams | undefined = cusEntId
		? { cusEntIds: [cusEntId] }
		: undefined;

	await runDeductionTx({
		ctx,
		customerId,
		entityId,
		deductions: [
			{
				feature,
				deduction: -amountToAdd, // Negative deduction = add to balance
			},
		],
		sortParams,
		skipAdditionalBalance: true,
		alterGrantedBalance: true,
		refreshCache: true,
	});
};
