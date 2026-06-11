/**
 * One usage-window counter mutation from a deduction (sibling of
 * MutationLogItem, kept as its own stream): which window row moved and by how
 * much. The row is identified by its stored id plus the logical key
 * (feature + window + entity scope); `usage_delta` is in the limit's native
 * unit (tracked units for metered dims, credits for balance dims).
 */
export interface UsageWindowMutation {
	usage_window_id: string | null;
	feature_id: string;
	internal_entity_id: string | null;
	window_start_at: number;
	usage_delta: number;
}
