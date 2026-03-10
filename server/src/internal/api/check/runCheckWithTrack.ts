import {
	ApiVersion,
	type CheckResponseV3,
	CheckResponseV3Schema,
	ErrCode,
	FeatureType,
	type FullCustomer,
	featureUtils,
	InsufficientBalanceError,
	InternalError,
	type ParsedCheckParams,
	RecaseError,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv.js";
import { runTrackV2 } from "@server/internal/balances/track/runTrackV2";
import { getTrackFeatureDeductions } from "@server/internal/balances/track/utils/getFeatureDeductions.js";
import { featureToCreditSystem } from "@server/internal/features/creditSystemUtils.js";
import { workflows } from "@/queue/workflows.js";
import type { CheckData } from "./checkTypes/CheckData.js";

export const runCheckWithTrack = async ({
	ctx,
	body,
	requiredBalance,
	checkData,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
	checkData: CheckData;
}): Promise<CheckResponseV3> => {
	if (!body.feature_id) {
		throw new InternalError({
			message: "ran check with track but no feature ID",
		});
	}

	if (ctx.isPublic) {
		throw new RecaseError({
			message:
				"Can't pass in 'send_event: true' when using publishable key for Autumn",
		});
	}

	if (body.lock && featureUtils.isAllocated(checkData.featureToUse)) {
		throw new RecaseError({
			message: "Lock is not supported for allocated features",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
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
	let fullCustomer: FullCustomer | undefined;

	try {
		// Use V2_1 to get ApiBalanceV1 format internally
		const response = await runTrackV2({
			ctx,
			body: trackBody,
			featureDeductions,
			apiVersion: ApiVersion.V2_1,
		});

		checkData.apiBalance = response.balance ?? undefined;
	} catch (error) {
		if (error instanceof InsufficientBalanceError) {
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

	// Schedule lock expiration if it exists
	if (body.lock?.expires_at && allowed) {
		await workflows.triggerExpireLockReceipt(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: body.customer_id,
				lockKey: body.lock.key,
				hashedKey: body.lock.hashed_key,
			},
			{
				scheduleAt: new Date(body.lock.expires_at),
			},
		);
	}

	const checkResponse = CheckResponseV3Schema.parse({
		allowed,
		customer_id: checkData.customerId || "",
		entity_id: checkData.entityId,
		required_balance: requiredBalance,
		balance: checkData.apiBalance ?? null,
		// lock_key: body.lock?.key,
	});

	return checkResponse;
};
