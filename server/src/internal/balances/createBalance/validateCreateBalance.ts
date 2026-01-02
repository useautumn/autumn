import {
	ErrCode,
	type Feature,
	FeatureType,
	type FullCustomer,
	RecaseError,
	ValidateCreateBalanceParamsSchema,
} from "@shared/index";
import { StatusCodes } from "http-status-codes";
import type { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";

export const validateCreateBalanceParams = async ({
	ctx,
	feature,
	internalCustomerId,
	granted_balance,
	unlimited,
	reset,
	fullCustomer,
}: {
	ctx: AutumnContext;
	feature: Feature;
	internalCustomerId: string;
	granted_balance: number | undefined;
	unlimited: boolean | undefined;
	reset: z.infer<typeof ValidateCreateBalanceParamsSchema>["reset"];
	fullCustomer: FullCustomer;
}) => {
	ValidateCreateBalanceParamsSchema.parse({
		feature,
		granted_balance,
		unlimited,
		reset,
		customer_id: internalCustomerId,
		feature_id: feature.id,
	});

	await validateBooleanEntitlementConflict({
		ctx,
		feature,
		internalCustomerId: fullCustomer.internal_id,
	});
};

export const validateBooleanEntitlementConflict = async ({
	ctx,
	feature,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	feature: Feature;
	internalCustomerId: string;
}) => {
	if (feature.type === FeatureType.Boolean) {
		const existingBooleanEntitlement = await CusEntService.getByFeature({
			db: ctx.db,
			internalFeatureId: feature.internal_id!,
			internalCustomerId,
		});

		if (existingBooleanEntitlement.length > 0) {
			throw new RecaseError({
				message: `A boolean entitlement ${feature.id} already exists for customer ${internalCustomerId}`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
};
