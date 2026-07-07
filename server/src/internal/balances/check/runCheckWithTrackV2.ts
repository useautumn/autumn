import {
	type ApiBalanceV1,
	ApiVersion,
	CheckResponseV3Schema,
	ErrCode,
	FeatureType,
	featureUtils,
	InsufficientBalanceError,
	InternalError,
	type ParsedCheckParams,
	RecaseError,
	type TrackParams,
	UsageLimitExceededError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackFeatureDeductions } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { runTrackV3 } from "@/internal/balances/track/v3/runTrackV3.js";
import { buildLockScheduleName } from "@/internal/balances/utils/lock/buildLockScheduleName.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import { workflows } from "@/queue/workflows.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";

/**
 * Checks if the customer has any entitlement for the requested feature.
 * Returns false when apiBalance is undefined, indicating no customer_entitlement exists.
 */
const customerHasEntitlementForFeature = (
	checkData: CheckDataV2,
): boolean => {
	return checkData.apiBalance !== undefined;
};

/**
 * Builds a check response for when the customer has no entitlement for the feature.
 */
const buildNoEntitlementResponse = ({
	checkData,
	requiredBalance,
}: {
	checkData: CheckDataV2;
	requiredBalance: number;
}) => {
	return CheckResponseV3Schema.parse({
		allowed: false,
		customer_id: checkData.customerId || "",
		entity_id: checkData.entityId,
		required_balance: requiredBalance,
		balance: null,
		balances: undefined,
		flag: checkData.apiFlag ?? null,
	});
};

export const runCheckWithTrackV2 = async ({
	ctx,
	body,
	requiredBalance,
	checkData,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
	checkData: CheckDataV2;
}) => {
	if (!body.feature_id) {
		throw new InternalError({
			message: "ran check with track but no feature ID",
		});
	}

	if (ctx.isPublic) {
		throw new RecaseError({
			message:
				"Can't use send_event: true with a publishable key. Use your secret API key instead.",
			statusCode: 400,
		});
	}

	if (body.lock && featureUtils.isAllocated(checkData.featureToUse)) {
		throw new RecaseError({
			message: "Lock is not supported for allocated features",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (checkData.originalFeature.type === FeatureType.Boolean) {
		throw new RecaseError({
			message:
				"send_event cannot be used with boolean features, which are flags rather than usage-tracked.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// When using locks, reject immediately if customer has no entitlement for the feature.
	// Without this check, the Lua deduction script returns success with empty mutation logs,
	// causing check to incorrectly return allowed: true.
	if (
		body.lock &&
		!customerHasEntitlementForFeature(checkData) &&
		requiredBalance > 0
	) {
		return buildNoEntitlementResponse({ checkData, requiredBalance });
	}

	const featureDeductions = getTrackFeatureDeductions({
		ctx,
		featureId: body.feature_id,
		lock: body.lock,
		value: requiredBalance,
	});

	const trackBody: TrackParams = {
		customer_id: body.customer_id,
		entity_id: body.entity_id,
		feature_id: body.feature_id,
		value: requiredBalance,
		properties: body.properties,
		skip_event: body.skip_event,
		overage_behavior: "reject",
		lock: body.lock,
	};

	let allowed = true;
	let trackBalances: Record<string, ApiBalanceV1 | null> | undefined;

	try {
		const response = await runTrackV3({
			ctx,
			body: trackBody,
			featureDeductions,
			apiVersion: ApiVersion.V2_1,
		});

		const trackedBalance =
			response.balance ?? response.balances?.[body.feature_id] ?? undefined;
		checkData.apiBalance = trackedBalance ?? undefined;
		checkData.evaluationApiBalance = trackedBalance ?? undefined;
		trackBalances = response.balances;
	} catch (error) {
		if (
			error instanceof InsufficientBalanceError ||
			error instanceof UsageLimitExceededError
		) {
			allowed = false;
		} else {
			throw error;
		}
	}

	const { featureToUse, originalFeature } = checkData;
	if (
		featureToUse.type === FeatureType.CreditSystem &&
		featureToUse.id !== originalFeature.id
	) {
		requiredBalance = featureToCreditSystem({
			featureId: originalFeature.id,
			creditSystem: featureToUse,
			amount: requiredBalance,
		});
	}

	if (body.lock?.expires_at && allowed) {
		try {
			const scheduleName = buildLockScheduleName({
				orgId: ctx.org.id,
				env: ctx.env,
				hashedKey: body.lock.hashed_key,
			});

			await workflows.triggerExpireLockReceipt(
				{
					orgId: ctx.org.id,
					env: ctx.env,
					customerId: body.customer_id,
					lockId: body.lock.lock_id,
					hashedKey: body.lock.hashed_key,
				},
				{
					scheduleAt: new Date(body.lock.expires_at),
					scheduleName,
				},
			);
		} catch (error) {
			ctx.logger.error(`Failed to schedule lock expiration: ${error}`);
		}
	}

	return CheckResponseV3Schema.parse({
		allowed,
		customer_id: checkData.customerId || "",
		entity_id: checkData.entityId,
		required_balance: requiredBalance,
		balance: checkData.apiBalance ?? null,
		balances: trackBalances,
		flag: checkData.apiFlag ?? null,
	});
};
