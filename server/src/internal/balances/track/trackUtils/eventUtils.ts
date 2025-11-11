import type { EventInsert } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { generateId } from "../../../../utils/genUtils.js";

export type EventInfo = {
	event_name: string;
	value?: number;
	properties?: Record<string, any>;
	timestamp?: number;
	idempotency_key?: string;
};

export const constructEvent = (params: {
	ctx: AutumnContext;
	eventInfo: EventInfo;
	internalCustomerId: string;
	internalEntityId?: string;
	customerId: string;
	entityId?: string;
}) => {
	const {
		ctx,
		eventInfo,
		internalCustomerId,
		internalEntityId,
		customerId,
		entityId,
	} = params;

	const { org, env } = ctx;

	const timestampDate = eventInfo.timestamp
		? new Date(eventInfo.timestamp)
		: new Date();

	const newEvent: EventInsert = {
		id: generateId("evt"),
		org_id: org.id,
		org_slug: org.slug,
		env: env,

		internal_customer_id: internalCustomerId,
		customer_id: customerId,
		internal_entity_id: internalEntityId,
		entity_id: entityId,

		event_name: eventInfo.event_name,
		created_at: timestampDate.getTime(),
		timestamp: timestampDate,
		value: eventInfo.value ?? 1,
		properties: eventInfo.properties ?? {},
		idempotency_key: eventInfo.idempotency_key ?? null,
		set_usage: false,
	} satisfies EventInsert;

	return newEvent;
};
