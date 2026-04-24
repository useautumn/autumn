import {
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
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackFeatureDeductions } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { runTrackV3 } from "@/internal/balances/track/v3/runTrackV3.js";
import { buildLockScheduleName } from "@/internal/balances/utils/lock/buildLockScheduleName.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import { workflows } from "@/queue/workflows.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";

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

	if (checkData.originalFeature.type === FeatureType.Boolean) {
		throw new RecaseError({
			message: "Not allowed to pass in send_event: true for a boolean feature",
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

	try {
		const response = await runTrackV3({
			ctx,
			body: trackBody,
			featureDeductions,
			apiVersion: ApiVersion.V2_1,
		});

		checkData.apiBalance = response.balance ?? undefined;
		checkData.evaluationApiBalance = response.balance ?? undefined;
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
		flag: checkData.apiFlag ?? null,
	});
};
