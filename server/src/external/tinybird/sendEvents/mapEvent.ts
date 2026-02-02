import type { EventInsert } from "@autumn/shared";

/** Tinybird event schema (matches events.datasource) */
export interface TinybirdEvent {
	id: string;
	org_id: string;
	org_slug: string | null;
	internal_customer_id: string | null;
	env: string;
	created_at: number | null;
	timestamp: string;
	event_name: string;
	idempotency_key: string | null;
	value: number | null;
	set_usage: number | null;
	entity_id: string | null;
	internal_entity_id: string | null;
	customer_id: string;
	properties: string | null;
}

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
		properties: event.properties ? JSON.stringify(event.properties) : null,
	};
};
