import { ErrCode, Event, Organization } from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { events } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { and, eq, desc } from "drizzle-orm";

export class EventService {
  static async insert({ db, event }: { db: DrizzleCli; event: Event }) {
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
    // [
    //   "id",
    //   "event_name",
    //   "value",
    //   "timestamp",
    //   "idempotency_key",
    //   "properties",
    //   "set_usage",
    //   "entity_id",
    // ]
    return await db
      .select({
        id: events.id,
        event_name: events.event_name,
        value: events.value,
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
      .orderBy(desc(events.timestamp))
      .limit(limit);
    // const { data, error } = await sb
    //   .from("events")
    //   .select(fields ? fields.join(",") : "*")
    //   .eq("internal_customer_id", internalCustomerId)
    //   .eq("org_id", orgId)
    //   .eq("env", env)
    //   .order("timestamp", { ascending: false })
    //   .limit(limit);

    // if (error) {
    //   throw new RecaseError({
    //     message: "Failed to get events",
    //     code: ErrCode.InternalError,
    //     data: error,
    //     statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    //   });
    // }

    // return data;
  }
}
