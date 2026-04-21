import {
	type CreateBalanceParamsV0,
	type EntInterval,
	ErrCode,
	type Feature,
	FeatureType,
	type FullCustomer,
	isContUseFeature,
	RecaseError,
	ResetInterval,
	ValidateCreateBalanceParamsSchema,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase";
import { getNextResetAt } from "@/utils/timeUtils";

export const validateCreateBalanceParams = async ({
	ctx,
	params,
	feature,
	fullCustomer,
}: {
	ctx: AutumnContext;
	params: CreateBalanceParamsV0;
	feature: Feature;
	fullCustomer: FullCustomer;
}) => {
	ValidateCreateBalanceParamsSchema.parse({
		...params,
		feature,
	});

	await validateBooleanEntitlementConflict({
		ctx,
		feature,
		fullCustomer,
	});

	// Entity cannot receive a balance of its own feature type
	const entity = fullCustomer.entity;
	if (entity && feature.id === entity.feature_id) {
		throw new RecaseError({
			message: `Cannot give an entity a balance of its own feature type`,
		});
	}

	if (
		isContUseFeature({ feature }) &&
		Object.keys(params.rollover || {}).length > 0
	) {
		throw new RecaseError({
			message: `Rollover is not supported for continuous use features`,
		});
	}

	if (Object.keys(params.reset || {}).length <= 0 && params.rollover) {
		throw new RecaseError({
			message: `Rollover cannot be provided for one-time balances`,
		});
	}

	if (
		params.rollover &&
		params.expires_at &&
		params.reset?.interval &&
		params.reset.interval !== ResetInterval.OneOff
	) {
		const nextResetAt = getNextResetAt({
			curReset: null,
			interval: params.reset.interval as unknown as EntInterval,
			intervalCount: params.reset.interval_count,
		});

		if (nextResetAt > params.expires_at) {
			throw new RecaseError({
				message: `expires_at (${new Date(params.expires_at).toISOString()}) occurs before the next rollover event (${new Date(nextResetAt).toISOString()})`,
			});
		}
	}

	if (params.balance_id) {
		await validateBalanceIdUnique({
			ctx,
			balanceId: params.balance_id,
			internalCustomerId: fullCustomer.internal_id,
		});
	}
};

const validateBalanceIdUnique = async ({
	ctx,
	balanceId,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	balanceId: string;
	internalCustomerId: string;
}) => {
	const existing = await CusEntService.get({
		ctx,
		externalId: balanceId,
		internalCustomerId,
	});

	if (existing) {
		throw new RecaseError({
			message: `balance_id '${balanceId}' is already in use for this customer`,
			code: ErrCode.InvalidRequest,
			statusCode: 409,
		});
	}
};

const validateBooleanEntitlementConflict = async ({
	ctx,
	feature,
	fullCustomer,
}: {
	ctx: AutumnContext;
	feature: Feature;
	fullCustomer: FullCustomer;
}) => {
	if (feature.type === FeatureType.Boolean) {
		const { apiCustomer } = await getApiCustomerBase({
			ctx,
			fullCus: fullCustomer,
		});

		if (apiCustomer.flags?.[feature.id]) {
			throw new RecaseError({
				message: `A boolean entitlement ${feature.id} already exists for customer ${fullCustomer.internal_id}`,
			});
		}
	}
};
