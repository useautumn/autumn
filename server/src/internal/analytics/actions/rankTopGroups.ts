import { getTinybirdPipes } from "@/external/tinybird/initTinybird.js";

// Array pipe params are comma-joined, so a comma or empty value can't round-trip.
const isArrayParamSafe = (value: string) =>
	value !== "" && !value.includes(",");

/**
 * Ranks the org's top customers (or values of propertyKey) per event over the window, as
 * aggregate_groupable top-group params. Undefined when nothing ranks or a value can't be an Array param.
 */
export const rankTopGroups = async ({
	orgId,
	env,
	eventNames,
	startDate,
	endDate,
	maxGroups,
	propertyKey,
	rankBy,
}: {
	orgId: string;
	env: string;
	eventNames: string[];
	startDate: string;
	endDate: string;
	maxGroups?: number;
	propertyKey?: string;
	rankBy?: "count";
}) => {
	const { data } = await getTinybirdPipes().aggregateGroupableTopGroups({
		org_id: orgId,
		env,
		event_names: eventNames,
		start_date: startDate,
		end_date: endDate,
		max_groups: maxGroups,
		rank_by: rankBy,
		...(propertyKey
			? { group_column: "property" as const, property_key: propertyKey }
			: {}),
	});

	const allSafe = data.every(
		(row) =>
			isArrayParamSafe(row.event_name) && isArrayParamSafe(row.group_value),
	);
	if (data.length === 0 || !allSafe) return undefined;

	const topEventNames = data.map((row) => row.event_name);
	const topGroupValues = data.map((row) => row.group_value);
	return propertyKey
		? { top_event_names: topEventNames, top_property_values: topGroupValues }
		: { top_event_names: topEventNames, top_customer_ids: topGroupValues };
};
