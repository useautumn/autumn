import { ErrCode, EventInsert } from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { events } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { and, eq, desc } from "drizzle-orm";

export class EventService {
  static async insert({ db, event }: { db: DrizzleCli; event: EventInsert }) {
    try {
      const results = await db
        .insert(events)
        .values(event as any)
        .returning();

      if (results.length === 0) {
        throw new RecaseError({
          message: "Failed to insert event",
          code: ErrCode.CreateEventFailed,
          data: results,
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        });
      }

      return results[0];
    } catch (error: any) {
      if (error.code == "23505") {
        throw new RecaseError({
          message:
            "Event (event_name, customer_id, idempotency_key) already exists.",
          code: ErrCode.DuplicateEvent,
          data: error,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      } else throw error;
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
    return await db
      .select({
        id: events.id,
        event_name: events.event_name,
        value: events.value,
        created_at: events.created_at,
        // timestamp: events.timestamp,
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
  }
}
