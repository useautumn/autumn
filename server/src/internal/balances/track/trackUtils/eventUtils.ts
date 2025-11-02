import type { EventInsert, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { generateId } from "../../../../utils/genUtils.js";

export type EventInfo = {
	event_name: string;
	value?: number;
	properties?: Record<string, any>;
	timestamp?: number;
	idempotency_key?: string;
};

export const constructEvent = async (params: {
	ctx: AutumnContext;
	eventInfo: EventInfo;
	fullCus: FullCustomer;
}) => {
	const { ctx, eventInfo, fullCus } = params;
	const { db, org, env, logger } = ctx;

	const timestampDate = eventInfo.timestamp
		? new Date(eventInfo.timestamp)
		: new Date();

	const newEvent: EventInsert = {
		id: generateId("evt"),
		org_id: org.id,
		org_slug: org.slug,
		env: env,

		internal_customer_id: fullCus.internal_id,
		customer_id: fullCus.id || "",
		internal_entity_id: fullCus.entity?.internal_id,
		entity_id: fullCus.entity?.id,

		event_name: eventInfo.event_name,
		created_at: timestampDate.getTime(),
		timestamp: timestampDate,
		value: eventInfo.value ?? 1,
		properties: eventInfo.properties ?? {},
		idempotency_key: eventInfo.idempotency_key ?? null,
	} satisfies EventInsert;

	return newEvent;
};
