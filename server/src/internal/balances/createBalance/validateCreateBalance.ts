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
	expires_at,
	fullCustomer,
	entity_id,
}: {
	ctx: AutumnContext;
	feature: Feature;
	internalCustomerId: string;
	granted_balance: number | undefined;
	unlimited: boolean | undefined;
	reset: z.infer<typeof ValidateCreateBalanceParamsSchema>["reset"];
	expires_at: number | undefined;
	fullCustomer: FullCustomer;
	entity_id?: string;
}) => {
	ValidateCreateBalanceParamsSchema.parse({
		feature,
		granted_balance,
		unlimited,
		reset,
		expires_at,
		customer_id: internalCustomerId,
		feature_id: feature.id,
		entity_id,
	});

	await validateBooleanEntitlementConflict({
		ctx,
		feature,
		internalCustomerId: fullCustomer.internal_id,
	});

	// Entity cannot receive a balance of its own feature type
	if (entity_id) {
		const entity = fullCustomer.entities.find((e) => e.id === entity_id);
		if (entity && feature.id === entity.feature_id) {
			throw new RecaseError({
				message: `Cannot give an entity a balance of its own feature type`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
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
