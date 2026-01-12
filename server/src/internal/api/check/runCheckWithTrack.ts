import {
	ApiVersion,
	type CheckParams,
	type CheckResponseV2,
	CheckResponseV2Schema,
	FeatureType,
	InsufficientBalanceError,
	InternalError,
	RecaseError,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv";
import { runTrackV2 } from "../../balances/track/runTrackV2";
import { getTrackFeatureDeductions } from "../../balances/track/trackUtils/getFeatureDeductions";
import { featureToCreditSystem } from "../../features/creditSystemUtils";
import type { CheckData } from "./checkTypes/CheckData";

export const runCheckWithTrack = async ({
	ctx,
	body,
	requiredBalance,
	checkData,
}: {
	ctx: AutumnContext;
	body: CheckParams;
	requiredBalance: number;
	checkData: CheckData;
}): Promise<CheckResponseV2> => {
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

	const featureDeductions = getTrackFeatureDeductions({
		ctx,
		featureId: body.feature_id,
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
	};

	let allowed = true;

	try {
		const response = await runTrackV2({
			ctx,
			body: trackBody,
			featureDeductions,
			apiVersion: ApiVersion.V2_0,
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

	const checkResponse = CheckResponseV2Schema.parse({
		allowed,
		customer_id: checkData.customerId || "",
		entity_id: checkData.entityId,
		required_balance: requiredBalance,
		balance: checkData.apiBalance ?? null,
	});

	return checkResponse;
};
