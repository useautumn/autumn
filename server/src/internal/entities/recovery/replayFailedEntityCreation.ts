import {
	ApiVersionClass,
	EntityErrorCode,
	findFeatureById,
	RecaseError,
} from "@autumn/shared";
import { isTransientDbError } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { CusService } from "@/internal/customers/CusService.js";
import { buildEntityDefaultProductsPlans } from "../actions/batchCreateEntities/attachDefaultProductsToEntities.js";
import { constructEntity } from "../entityUtils/entityUtils.js";
import type { EntityCreationRecoveryPayload } from "./entityCreationRecoveryTypes.js";

/** Both the validation check and the insert's unique constraint raise this, so
 *  it covers a replay whose entities landed before the drain reached them. */
const isAlreadyCreated = ({ error }: { error: unknown }) =>
	error instanceof RecaseError &&
	error.code === EntityErrorCode.EntityAlreadyExists;

/** A conflict only proves one entity landed. Anything left unconfirmed is a batch
 *  something else partly satisfied, which the replay cannot finish on its own. */
const findUnconfirmedEntities = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: EntityCreationRecoveryPayload;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: payload.params.customer_id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!customer) return payload.params.create_entity_data;

	const unconfirmed = [];
	for (const inputEntity of payload.params.create_entity_data) {
		// An id-less entity has nothing to match on, so it can never be confirmed
		// created. Claiming the batch landed would silently drop it.
		if (!inputEntity.id) {
			unconfirmed.push(inputEntity);
			continue;
		}
		const internalFeatureId = ctx.features.find(
			(feature) => feature.id === inputEntity.feature_id,
		)?.internal_id;
		// A feature removed or renamed since the capture cannot be looked up, which
		// is a reason to doubt the entity landed, not to assume it did.
		if (!internalFeatureId) {
			unconfirmed.push(inputEntity);
			continue;
		}

		// Read per entity rather than through the customer aggregate, which caps
		// how many entities it returns and would report a committed one as missing.
		const entity = await EntityService.get({
			db: ctx.db,
			id: inputEntity.id,
			internalCustomerId: customer.internal_id,
			internalFeatureId,
		});
		if (!entity) unconfirmed.push(inputEntity);
	}

	return unconfirmed;
};

export const replayFailedEntityCreation = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: EntityCreationRecoveryPayload;
}) => {
	const { customer_id: customerId, create_entity_data: createEntityData } =
		payload.params;

	const replayLog = {
		sourceRequestId: payload.requestId,
		customerId,
		entities: createEntityData.map(({ id, feature_id }) => ({
			id,
			feature_id,
		})),
	};

	// Absent, not false: a payload without the marker predates it or came from a
	// producer that does not set it, and neither can be assumed to have written
	// nothing.
	if (payload.mayHaveWritten !== false) {
		// The worker acks a non-transient throw, so this log is the only surviving
		// record of what the shed request was part-way through creating.
		ctx.extraLogs.entityCreationRecoveryReplay = {
			outcome: "manual_review",
			...replayLog,
		};
		ctx.logger.error(
			"[entityCreationRecovery] Replay requires manual review, the request may already have written",
			replayLog,
		);

		throw new Error(
			`Entity creation recovery ${payload.requestId} requires manual review (the shed request may already have decremented a balance or committed an entity)`,
		);
	}

	ctx.apiVersion = new ApiVersionClass(payload.apiVersion);
	ctx.skipCache = true;

	try {
		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const entities = createEntityData.map((inputEntity) =>
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
		const autumnBillingPlans = await buildEntityDefaultProductsPlans({
			ctx,
			fullCustomer: customer,
			entities,
			customerData: payload.params.customer_data,
		});

		await ctx.db.transaction(async (tx) => {
			const transactionCtx = { ...ctx, db: tx as unknown as DrizzleCli };
			await EntityService.insert({ db: transactionCtx.db, data: entities });
			for (const autumnBillingPlan of autumnBillingPlans) {
				await executeAutumnBillingPlan({
					ctx: transactionCtx,
					autumnBillingPlan,
				});
			}
		});
	} catch (error) {
		if (isAlreadyCreated({ error })) {
			const unconfirmed = await findUnconfirmedEntities({ ctx, payload });
			if (unconfirmed.length === 0) {
				ctx.extraLogs.entityCreationRecoveryReplay = {
					outcome: "already_exists",
					...replayLog,
				};
				ctx.logger.info(
					"[entityCreationRecovery] Replay skipped, entities already exist",
					replayLog,
				);
				return;
			}

			// The worker acks this, so the log is the only record that these were
			// asked for and never created.
			ctx.extraLogs.entityCreationRecoveryReplay = {
				outcome: "partially_created",
				...replayLog,
				unconfirmed: unconfirmed.map(({ id, feature_id }) => ({
					id,
					feature_id,
				})),
			};
			ctx.logger.error(
				"[entityCreationRecovery] Replay conflicted, entities left uncreated",
				{
					...replayLog,
					unconfirmed: unconfirmed.map(({ id, feature_id }) => ({
						id,
						feature_id,
					})),
				},
			);
			return;
		}

		if (!isTransientDbError({ error }) && !isTransientRedisError({ error })) {
			ctx.extraLogs.entityCreationRecoveryReplay = {
				outcome: "rejected",
				...replayLog,
			};
			ctx.logger.error("[entityCreationRecovery] Replay rejected, dropping", {
				...replayLog,
				error,
			});
		}

		throw error;
	}

	ctx.extraLogs.entityCreationRecoveryReplay = {
		outcome: "created",
		...replayLog,
	};
	ctx.logger.info("[entityCreationRecovery] Replay completed", replayLog);
};
