const BUILT_IN_GROUP_COLUMNS = new Set(["customer_id", "entity_id", "plan_id"]);

export const isBuiltInGroupBy = ({ groupBy }: { groupBy: string }) =>
	BUILT_IN_GROUP_COLUMNS.has(groupBy);

export const groupByToColumn = ({ groupBy }: { groupBy: string }) =>
	isBuiltInGroupBy({ groupBy }) ? groupBy : `properties.${groupBy}`;
