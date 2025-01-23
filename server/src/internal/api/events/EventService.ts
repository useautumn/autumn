import { SupabaseClient } from "@supabase/supabase-js";
import { ErrCode, Event, Organization } from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";

export class EventService {
  static async insertEvent(sb: SupabaseClient, event: Event) {
    const { data, error } = await sb.from("events").insert(event);

    if (error) {
      if (error.code == "23505") {
        throw new RecaseError({
          message:
            "Event (event_name, customer_id, idempotency_key) already exists.",
          code: ErrCode.DuplicateEvent,
          data: error,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      } else {
        throw new RecaseError({
          message: "Failed to insert event",
          code: ErrCode.CreateEventFailed,
          data: error,
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        });
      }
    }

    return data;
  }

  static async getByCustomerId({
    sb,
    customerId,
    org,
    env,
    limit = 10,
  }: {
    sb: SupabaseClient;
    customerId: string;
    org: Organization;
    env: string;
    limit?: number;
  }) {
    const { data, error } = await sb
      .from("events")
      .select("*")
      .eq("customer_id", customerId)
      .eq("org_id", org.id)
      .eq("env", env)
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) {
      throw new RecaseError({
        message: "Failed to get events",
        code: ErrCode.InternalError,
        data: error,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      });
    }

    return data;
  }
}
