import type { EventInsert } from "@autumn/shared";
import type { TinybirdEvent } from "../initTinybird.js";

/** Convert EventInsert to Tinybird schema */
export const mapToTinybirdEvent = (event: EventInsert): TinybirdEvent => {
	let timestampStr: string;
	if (event.timestamp instanceof Date) {
		timestampStr = event.timestamp.toISOString();
	} else if (typeof event.timestamp === "string") {
		timestampStr = event.timestamp;
	} else {
		timestampStr = new Date().toISOString();
	}

	return {
		id: event.id,
		org_id: event.org_id,
		org_slug: event.org_slug ?? null,
		internal_customer_id: event.internal_customer_id ?? null,
		env: event.env,
		created_at: event.created_at ?? null,
		timestamp: timestampStr,
		event_name: event.event_name,
		idempotency_key: event.idempotency_key ?? null,
		value: event.value ?? null,
		set_usage: event.set_usage ? 1 : 0,
		entity_id: event.entity_id ?? null,
		internal_entity_id: event.internal_entity_id ?? null,
		customer_id: event.customer_id,
		properties: event.properties ?? null,
	};
};
