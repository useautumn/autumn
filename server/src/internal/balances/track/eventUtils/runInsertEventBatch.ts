import {
	type AppEnv,
	customers,
	type EventInsert,
	entities,
	events,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { Logger } from "pino";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { JobName } from "@/queue/JobName.js";
import type { Payloads } from "@/queue/queueUtils.js";
import { generateId } from "../../../../utils/genUtils.js";

type InsertEventBatchPayload = Payloads[typeof JobName.InsertEventBatch];

/**
 * Worker function to batch insert track events into the database
 */
export const runInsertEventBatch = async ({
	db,
	payload,
	logger,
}: {
	db: DrizzleCli;
	payload: InsertEventBatchPayload;
	logger: Logger;
}) => {
	const { events: eventContexts } = payload;

	if (!eventContexts || eventContexts.length === 0) {
		logger.warn("Empty event batch received");
		return;
	}

	logger.info(`Processing event batch: ${eventContexts.length} events`);

	// Collect unique (orgId, env, customerId) pairs to batch lookup internal IDs
	const customerLookups = new Map<
		string,
		{ orgId: string; env: string; customerId: string }
	>();
	const entityLookups = new Map<
		string,
		{ orgId: string; env: string; customerId: string; entityId: string }
	>();

	for (const eventCtx of eventContexts) {
		const cusKey = `${eventCtx.orgId}:${eventCtx.env}:${eventCtx.customerId}`;
		if (!customerLookups.has(cusKey)) {
			customerLookups.set(cusKey, {
				orgId: eventCtx.orgId,
				env: eventCtx.env,
				customerId: eventCtx.customerId,
			});
		}

		if (eventCtx.entityId) {
			const entKey = `${eventCtx.orgId}:${eventCtx.env}:${eventCtx.customerId}:${eventCtx.entityId}`;
			if (!entityLookups.has(entKey)) {
				entityLookups.set(entKey, {
					orgId: eventCtx.orgId,
					env: eventCtx.env,
					customerId: eventCtx.customerId,
					entityId: eventCtx.entityId,
				});
			}
		}
	}

	// Batch lookup internal_customer_ids
	const internalCustomerIds = new Map<string, string>();
	for (const [key, { orgId, env, customerId }] of customerLookups.entries()) {
		const result = await db
			.select({ internal_id: customers.internal_id })
			.from(customers)
			.where(
				and(
					eq(customers.org_id, orgId),
					eq(customers.env, env as AppEnv),
					eq(customers.id, customerId),
				),
			)
			.limit(1);

		if (result[0]) {
			internalCustomerIds.set(key, result[0].internal_id);
		}
	}

	// Batch lookup internal_entity_ids
	const internalEntityIds = new Map<string, string>();
	for (const [
		key,
		{ orgId, env, customerId, entityId },
	] of entityLookups.entries()) {
		const cusKey = `${orgId}:${env}:${customerId}`;
		const internalCustomerId = internalCustomerIds.get(cusKey);

		if (internalCustomerId) {
			const result = await db
				.select({ internal_id: entities.internal_id })
				.from(entities)
				.where(
					and(
						eq(entities.internal_customer_id, internalCustomerId),
						eq(entities.id, entityId),
					),
				)
				.limit(1);

			if (result[0]) {
				internalEntityIds.set(key, result[0].internal_id);
			}
		}
	}

	// Build event inserts
	const eventInserts: EventInsert[] = eventContexts.map((eventCtx) => {
		const timestampDate = eventCtx.timestamp
			? new Date(eventCtx.timestamp)
			: new Date();

		const cusKey = `${eventCtx.orgId}:${eventCtx.env}:${eventCtx.customerId}`;
		const internalCustomerId = internalCustomerIds.get(cusKey);

		let internalEntityId: string | undefined;
		if (eventCtx.entityId) {
			const entKey = `${eventCtx.orgId}:${eventCtx.env}:${eventCtx.customerId}:${eventCtx.entityId}`;
			internalEntityId = internalEntityIds.get(entKey);
		}

		return {
			id: generateId("evt"),
			org_id: eventCtx.orgId,
			org_slug: eventCtx.orgSlug,
			env: eventCtx.env,

			internal_customer_id: internalCustomerId,
			customer_id: eventCtx.customerId,
			internal_entity_id: internalEntityId,
			entity_id: eventCtx.entityId,

			event_name: eventCtx.eventName,
			created_at: timestampDate.getTime(),
			timestamp: timestampDate,
			value: eventCtx.value ?? 1,
			properties: eventCtx.properties ?? {},
			idempotency_key: null,
			set_usage: false,
		} satisfies EventInsert;
	});

	// Batch insert events
	try {
		await db.insert(events).values(eventInserts as any);
		logger.info(`✅ Successfully inserted ${eventInserts.length} events`);
	} catch (error: any) {
		logger.error(`❌ Failed to batch insert events: ${error.message}`);
		throw error;
	}
};
