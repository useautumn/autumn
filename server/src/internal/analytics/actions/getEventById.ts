import { getClickhouseClient } from "@/external/tinybird/initClickhouse.js";

type EventRow = {
	id: string;
	org_id: string;
	env: string;
	customer_id: string;
	event_name: string;
	timestamp: string;
	value: string | null;
	properties: string | null;
	idempotency_key: string | null;
	entity_id: string | null;
};

/** Gets a single event by ID. Throws if not found. */
export const getEventById = async ({
	orgId,
	env,
	eventId,
}: {
	orgId: string;
	env: string;
	eventId: string;
}): Promise<EventRow> => {
	const ch = getClickhouseClient();

	const query = `
		SELECT *
		FROM events
		WHERE org_id = {org_id:String}
			AND env = {env:String}
			AND id = {event_id:String}
		LIMIT 1
	`;

	const result = await ch.query({
		query,
		query_params: {
			org_id: orgId,
			env,
			event_id: eventId,
		},
		format: "JSON",
	});

	const resultJson = (await result.json()) as { data: EventRow[] };

	if (resultJson.data.length === 0) {
		throw new Error(`Event not found: ${eventId}`);
	}

	return resultJson.data[0];
};
