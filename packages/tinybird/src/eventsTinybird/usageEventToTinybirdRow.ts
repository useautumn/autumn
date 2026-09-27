import type { EventInsert } from "@autumn/shared";

/** The `events` datasource's columns: JSON travels as strings, and deductions are wrapped the way the API server wraps them. */
export const usageEventToTinybirdRow = ({ event }: { event: EventInsert }) => ({
	id: event.id,
	org_id: event.org_id,
	org_slug: event.org_slug ?? null,
	internal_customer_id: event.internal_customer_id ?? null,
	env: event.env,
	created_at: event.created_at ?? null,
	timestamp: new Date(event.timestamp ?? Date.now()).toISOString(),
	event_name: event.event_name,
	idempotency_key: event.idempotency_key ?? null,
	value: event.value ?? null,
	set_usage: event.set_usage ? 1 : 0,
	entity_id: event.entity_id ?? null,
	internal_entity_id: event.internal_entity_id ?? null,
	internal_product_id: event.internal_product_id ?? null,
	customer_id: event.customer_id,
	properties: event.properties ? JSON.stringify(event.properties) : null,
	deductions: event.deductions
		? JSON.stringify({ list: event.deductions })
		: "{}",
});
