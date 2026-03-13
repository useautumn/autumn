import {
	type CreateBalanceParamsV0,
	ErrCode,
	type Feature,
	FeatureType,
	type FullCustomer,
	RecaseError,
	ValidateCreateBalanceParamsSchema,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase";

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
