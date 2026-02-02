import { ErrCode, type EventInsert, events, RecaseError } from "@autumn/shared";
import { and, desc, eq } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import type { Logger } from "pino";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export class EventService {
	/** Insert event(s) into Postgres (Tinybird publishing is handled by EventBatchingManager) */
	static async insert({
		db,
		event,
	}: {
		db: DrizzleCli;
		event: EventInsert | EventInsert[];
		logger?: Logger;
	}) {
		try {
			const results = await db
				.insert(events)
				.values(event as any)
				.returning();

			return results?.[0];
		} catch (error: any) {
			if (error.code === "23505") {
				throw new RecaseError({
					message:
						"Event (event_name, customer_id, idempotency_key) already exists.",
					code: ErrCode.DuplicateEvent,
					statusCode: StatusCodes.CONFLICT,
				});
			}
			throw error;
		}
	}

	static async getByCustomerId({
		db,
		orgId,
		internalCustomerId,
		env,
		limit = 10,
	}: {
		db: DrizzleCli;
		internalCustomerId: string;
		orgId: string;
		env: string;
		limit?: number;
	}) {
		const results = await db
			.select({
				id: events.id,
				event_name: events.event_name,
				value: events.value,
				created_at: events.created_at,
				timestamp: events.timestamp,
				idempotency_key: events.idempotency_key,
				properties: events.properties,
				set_usage: events.set_usage,
				entity_id: events.entity_id,
			})
			.from(events)
			.where(
				and(
					eq(events.internal_customer_id, internalCustomerId),
					eq(events.org_id, orgId),
					eq(events.env, env),
				),
			)
			.orderBy(desc(events.created_at))
			.limit(limit);

		return results;
	}
}
