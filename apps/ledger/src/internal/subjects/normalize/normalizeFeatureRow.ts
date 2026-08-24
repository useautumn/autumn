import type { features } from "../../../sqlite/common/schema/features.js";

type FeatureRow = typeof features.$inferInsert;

export type NormalizedFeatureRow = FeatureRow & {
	created_at: number;
	name: string;
	event_names: string[];
};

// Postgres allows nulls the model does not, so the mirror stores the column
// defaults its readers rely on.
export const normalizeFeatureRow = ({
	row,
}: {
	row: FeatureRow;
}): NormalizedFeatureRow => ({
	...row,
	created_at: row.created_at ?? 0,
	name: row.name ?? row.id,
	event_names: row.event_names ?? [],
});
