const BUILT_IN_GROUP_COLUMNS = new Set(["customer_id", "entity_id", "plan_id"]);

/** Customer, entity and plan are real columns; anything else is an event property. */
export const isBuiltInGroupBy = ({ groupBy }: { groupBy: string }) =>
	BUILT_IN_GROUP_COLUMNS.has(groupBy);

/** The events-row column holding a group's value. */
export const groupByToColumn = ({ groupBy }: { groupBy: string }) =>
	isBuiltInGroupBy({ groupBy }) ? groupBy : `properties.${groupBy}`;
