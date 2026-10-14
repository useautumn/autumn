export interface UsageWindowMutation {
	usage_window_id: string | null;
	feature_id: string;
	internal_entity_id: string | null;
	window_start_at: number;
	usage_delta: number;
}
