import {
	addDuration,
	type CustomerEntitlement,
	type Entitlement,
	type EntitlementDuration,
	ErrCode,
	FeatureType,
	type FullCustomer,
	findFeatureByInternalId,
	RecaseError,
	type Reward,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { prepareNewBalanceForInsertion } from "@/internal/balances/createBalance/prepareNewBalanceForInsertion.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { generateId } from "@/utils/genUtils.js";

type RewardEntitlement = NonNullable<Reward["entitlements"]>[number];

/** Reward entitlements are stored as nested `expiry` or legacy flat `expiry_*` fields */
const resolveExpiresAt = (rewardEnt: RewardEntitlement) => {
	const nested =
		"expiry" in rewardEnt
			? (rewardEnt.expiry as
					| { duration?: EntitlementDuration; length?: number }
					| null
					| undefined)
			: undefined;
	if (nested?.duration && nested.length != null) {
		return addDuration({
			now: Date.now(),
			durationType: nested.duration,
			durationLength: nested.length,
		});
	}

	const duration =
		"expiry_duration" in rewardEnt
			? (rewardEnt.expiry_duration as EntitlementDuration | null | undefined)
			: undefined;
	const length =
		"expiry_length" in rewardEnt
			? (rewardEnt.expiry_length as number | null | undefined)
			: undefined;

	if (duration && length != null) {
		return addDuration({
			now: Date.now(),
			durationType: duration,
			durationLength: length,
		});
	}

	return undefined;
};

/**
 * Grant a feature-grant reward's entitlements to a customer as loose balances.
 * Callers own redemption records and any redemption-eligibility checks.
 */
export const grantRewardEntitlements = async ({
	ctx,
	fullCustomer,
	reward,
	balanceIdPrefix,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	reward: Reward;
	balanceIdPrefix: string;
}) => {
	const { db, logger } = ctx;

	if (!reward.entitlements?.length) {
		throw new RecaseError({
			message: `Reward "${reward.id}" has no entitlements configured`,
			code: ErrCode.InvalidReward,
			statusCode: 400,
		});
	}

	const newEntitlements: Entitlement[] = [];
	const newCustomerEntitlements: CustomerEntitlement[] = [];

	for (const rewardEnt of reward.entitlements) {
		const feature = findFeatureByInternalId({
			features: ctx.features,
			internalId: rewardEnt.internal_feature_id,
		});

		if (!feature) {
			logger.warn(
				`Feature with internal_id "${rewardEnt.internal_feature_id}" not found, skipping`,
			);
			continue;
		}

		const isBoolean = feature.type === FeatureType.Boolean;
		const allowance = rewardEnt.allowance;
		if (!isBoolean && (!allowance || allowance <= 0)) {
			throw new RecaseError({
				message: `Reward entitlement for feature "${feature.id}" must have a positive allowance`,
				code: ErrCode.InvalidReward,
				statusCode: 400,
			});
		}

		const { newEntitlement, newCustomerEntitlement } =
			await prepareNewBalanceForInsertion({
				ctx,
				fullCustomer,
				feature,
				params: {
					customer_id: fullCustomer.id!,
					feature_id: feature.id,
					included_grant: isBoolean ? undefined : (allowance ?? undefined),
					expires_at: resolveExpiresAt(rewardEnt),
					balance_id: `${balanceIdPrefix}_${feature.id}_${generateId("bal")}`,
				},
			});

		newEntitlements.push(newEntitlement);
		newCustomerEntitlements.push(newCustomerEntitlement);
	}

	if (!newEntitlements.length) {
		throw new RecaseError({
			message:
				"No valid entitlements could be created from reward configuration",
			code: ErrCode.InvalidReward,
			statusCode: 400,
		});
	}

	await EntitlementService.insert({ db, data: newEntitlements });
	await CusEntService.insert({ ctx, data: newCustomerEntitlements });

	await deleteCachedFullCustomer({
		customerId: fullCustomer.id!,
		ctx,
		source: "grantRewardEntitlements",
	});

	logger.info(
		`Granted ${newEntitlements.length} entitlement(s) to customer "${fullCustomer.id}" from reward "${reward.id}"`,
	);

	return { newEntitlements, newCustomerEntitlements };
};
