import {
	type CreateBalanceParams,
	ErrCode,
	type Feature,
	FeatureType,
	type FullCustomer,
	RecaseError,
	ValidateCreateBalanceParamsSchema,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
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
	params: CreateBalanceParams;
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
};

export const validateBooleanEntitlementConflict = async ({
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

		if (apiCustomer.balances?.[feature.id]) {
			throw new RecaseError({
				message: `A boolean entitlement ${feature.id} already exists for customer ${fullCustomer.internal_id}`,
			});
		}
	}
};
