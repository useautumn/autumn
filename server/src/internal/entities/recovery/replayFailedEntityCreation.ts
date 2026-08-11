import { ApiVersionClass, EntityErrorCode, RecaseError } from "@autumn/shared";
import { isShedError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { batchCreateEntities } from "../actions/batchCreateEntities.js";
import type { EntityCreationRecoveryPayload } from "./entityCreationRecoveryTypes.js";

/** Both the validation check and the insert's unique constraint raise this, so
 *  it covers a replay whose entities landed before the drain reached them. */
const isAlreadyCreated = ({ error }: { error: unknown }) =>
	error instanceof RecaseError &&
	error.code === EntityErrorCode.EntityAlreadyExists;

/** A conflict only proves one entity landed. Anything still missing is a batch
 *  something else partly satisfied, which the replay cannot finish on its own. */
const findMissingEntities = async ({
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

	const missing = [];
	for (const inputEntity of payload.params.create_entity_data) {
		if (!inputEntity.id) continue;
		const internalFeatureId = ctx.features.find(
			(feature) => feature.id === inputEntity.feature_id,
		)?.internal_id;
		if (!internalFeatureId) continue;

		// Read per entity rather than through the customer aggregate, which caps
		// how many entities it returns and would report a committed one as missing.
		const entity = await EntityService.get({
			db: ctx.db,
			id: inputEntity.id,
			internalCustomerId: customer.internal_id,
			internalFeatureId,
		});
		if (!entity) missing.push(inputEntity);
	}

	return missing;
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

	ctx.apiVersion = new ApiVersionClass(payload.apiVersion);
	// Both create handlers read through to Postgres; a replay must do the same or
	// it decides idempotency from a cache the shed request already invalidated.
	ctx.skipCache = true;

	try {
		await batchCreateEntities({
			ctx,
			customerId,
			createEntityData,
			customerData: payload.params.customer_data,
			withAutumnId: payload.withAutumnId,
			source: "entityCreationRecovery",
			enqueueRecoveryOnTransientFailure: false,
			skipSeatCharge: true,
		});
	} catch (error) {
		if (isAlreadyCreated({ error })) {
			const missing = await findMissingEntities({ ctx, payload });
			if (missing.length === 0) {
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
				missing: missing.map(({ id, feature_id }) => ({ id, feature_id })),
			};
			ctx.logger.error(
				"[entityCreationRecovery] Replay conflicted, entities left uncreated",
				{
					...replayLog,
					missing: missing.map(({ id, feature_id }) => ({ id, feature_id })),
				},
			);
			return;
		}

		// A shed stays in SQS, but anything else drops the message, so the reason
		// the request could not be recreated has to be logged here.
		if (!isShedError({ error })) {
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
