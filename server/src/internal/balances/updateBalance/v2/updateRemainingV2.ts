import {
	FeatureNotFoundError,
	type FullSubject,
	notNullish,
	tryCatch,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { syncItemV4 } from "@/internal/balances/utils/sync/syncItemV4.js";
import { shadowTapGrant } from "@/internal/metering/shadow/shadowTap.js";
import { buildCustomerEntitlementFilters } from "../../utils/buildCustomerEntitlementFilters.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { handleUpdateBalanceDeductionErrorV2 } from "./handleUpdateBalanceDeductionErrorV2.js";

/** Seeded from the request id rather than a client key so an SQS replay of the
 *  same balances.update mirrors under the same event id (a replay reuses
 *  `ctx.id`), matching how the deduct tap seeds its own key. */
const getBalanceUpdateMutationId = ({ ctx }: { ctx: AutumnContext }): string =>
	`balance_update:${ctx.id}`;

/** Shadow only: `add_to_balance` is the one branch of balances.update that
 *  strictly increases the balance, so it is the only one the v1 event schema's
 *  "grant" can express. The `remaining` / `current_balance` branch sets an
 *  absolute value, which the fold has no event for, so it stays unmirrored.
 *  Fire-and-forget by construction; it cannot fail the update. */
const mirrorGrantToMeteringShadow = ({
	ctx,
	fullSubject,
	featureId,
	addToBalance,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureId: string;
	addToBalance: number | null | undefined;
}): void => {
	if (!notNullish(addToBalance) || addToBalance <= 0) return;

	shadowTapGrant({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: fullSubject.customerId,
		featureId,
		value: addToBalance,
		idempotencyKey: getBalanceUpdateMutationId({ ctx }),
	});
};

/** Updates remaining balance using the FullSubject cache path. */
export const updateRemainingV2 = async ({
	ctx,
	fullSubject,
	params,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	params: UpdateBalanceParamsV0;
}) => {
	const { features } = ctx;
	const { feature_id: featureId, add_to_balance: addToBalance } = params;
	const targetBalance = params.remaining ?? params.current_balance;

	const feature = features.find((f) => f.id === featureId);
	if (!feature) throw new FeatureNotFoundError({ featureId });

	const customerEntitlementFilters = buildCustomerEntitlementFilters({
		params,
	});

	const featureDeductions: FeatureDeduction[] = [
		{
			feature,
			deduction: notNullish(addToBalance) ? -addToBalance : 0,
			targetBalance: notNullish(targetBalance) ? targetBalance : undefined,
		},
	];

	const entityId = fullSubject.entityId;

	const { data: result, error } = await tryCatch(
		executeRedisDeductionV2({
			ctx,
			fullSubject,
			entityId,
			deductions: featureDeductions,
			deductionOptions: {
				overageBehaviour: "allow",
				customerEntitlementFilters,
				alterGrantedBalance: false,
			},
		}),
	);

	if (error) {
		return handleUpdateBalanceDeductionErrorV2({
			ctx,
			error,
			fullSubject,
			featureDeductions,
			customerEntitlementFilters,
		});
	}

	mirrorGrantToMeteringShadow({
		ctx,
		fullSubject,
		featureId,
		addToBalance,
	});

	const { rolloverUpdates, modifiedCusEntIdsByFeatureId, usageWindowUpdates } =
		result;
	const cusEntIds = Object.values(modifiedCusEntIdsByFeatureId).flat();
	const rolloverIds = Object.keys(rolloverUpdates);

	if (
		cusEntIds.length > 0 ||
		rolloverIds.length > 0 ||
		usageWindowUpdates.length > 0
	) {
		await syncItemV4({
			ctx,
			payload: {
				customerId: fullSubject.customerId,
				orgId: ctx.org.id,
				env: ctx.env,
				timestamp: Date.now(),
				rolloverIds,
				entityId: fullSubject.entityId,
				modifiedCusEntIdsByFeatureId,
				usageWindowUpdates,
			},
		});
	}

	return result;
};
