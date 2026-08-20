import { ApiVersionClass, findFeatureById } from "@autumn/shared";
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
	await ctx.db.transaction(async (tx) => {
		const transactionCtx = { ...ctx, db: tx as unknown as DrizzleCli };
		const entities = payload.params.create_entity_data.map((inputEntity) =>
			constructEntity({
				inputEntity,
				feature: findFeatureById({
					features: ctx.features,
					featureId: inputEntity.feature_id,
					errorOnNotFound: true,
				}),
				internalCustomerId: customer.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		);
		const insertedEntities = await EntityService.insert({
			db: transactionCtx.db,
			data: entities,
			ignoreConflicts: true,
		});
		if (insertedEntities.length === 0) return;
		await attachDefaultProductsToEntities({
			ctx: transactionCtx,
			fullCustomer: customer,
			entities: insertedEntities,
			customerData: payload.params.customer_data,
		});
	});
};
