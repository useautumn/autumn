import { getTinybirdPipes } from "@/external/tinybird/initTinybird.js";

// Array pipe params are comma-joined, so a comma or empty value can't round-trip.
const isArrayParamSafe = (value: string) =>
	value !== "" && !value.includes(",");

/**
 * Ranks the org's top customers per event over the window, as aggregate_groupable top-group params.
 * Returns undefined when there is nothing to rank or a value can't be passed as an Array param.
 */
export const rankTopGroups = async ({
	orgId,
	env,
	eventNames,
	startDate,
	endDate,
	maxGroups,
}: {
	orgId: string;
	env: string;
	eventNames: string[];
	startDate: string;
	endDate: string;
	maxGroups?: number;
}) => {
	const { data } = await getTinybirdPipes().aggregateGroupableTopGroups({
		org_id: orgId,
		env,
		event_names: eventNames,
		start_date: startDate,
		end_date: endDate,
		max_groups: maxGroups,
	});

	const allSafe = data.every(
		(row) =>
			isArrayParamSafe(row.event_name) && isArrayParamSafe(row.group_value),
	);
	if (data.length === 0 || !allSafe) return undefined;

	return {
		top_event_names: data.map((row) => row.event_name),
		top_customer_ids: data.map((row) => row.group_value),
	};
};
