import {
	ApiVersionClass,
	type CreateEntityParams,
	EntityErrorCode,
	type Feature,
	findFeatureById,
	RecaseError,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { attachDefaultProductsToEntities } from "../actions/batchCreateEntities/attachDefaultProductsToEntities.js";
import { constructEntity } from "../entityUtils/entityUtils.js";
import type { EntityCreationRecoveryPayload } from "./entityCreationRecoveryTypes.js";

export const replayFailedEntityCreation = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: EntityCreationRecoveryPayload;
}) => {
	ctx.apiVersion = new ApiVersionClass(payload.apiVersion);
	ctx.skipCache = true;
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: payload.params.customer_id,
	});
	const missing: Array<{ inputEntity: CreateEntityParams; feature: Feature }> =
		[];
	for (const inputEntity of payload.params.create_entity_data) {
		const feature = findFeatureById({
			features: ctx.features,
			featureId: inputEntity.feature_id,
			errorOnNotFound: true,
		});
		const existing = await EntityService.get({
			db: ctx.db,
			id: inputEntity.id as string,
			internalCustomerId: customer.internal_id,
			internalFeatureId: feature.internal_id,
		});
		if (!existing) missing.push({ inputEntity, feature });
	}
	if (missing.length === 0) return;
	await ctx.db.transaction(async (tx) => {
		const transactionCtx = { ...ctx, db: tx as unknown as DrizzleCli };
		const entities = missing.map(({ inputEntity, feature }) =>
			constructEntity({
				inputEntity,
				feature,
				internalCustomerId: customer.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		);
		try {
			await EntityService.insert({ db: transactionCtx.db, data: entities });
		} catch (error) {
			if (
				!(error instanceof RecaseError) ||
				error.code !== EntityErrorCode.EntityAlreadyExists
			)
				throw error;
			return;
		}
		await attachDefaultProductsToEntities({
			ctx: transactionCtx,
			fullCustomer: customer,
			entities,
			customerData: payload.params.customer_data,
		});
	});
};
