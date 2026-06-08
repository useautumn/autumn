export type LogRequestContext = {
	id: string;
	method: string;
	url: string;
	timestamp: number;
	customer_id?: string;
	entity_id?: string;
	user_agent?: string;
	ip_address?: string;
	region?: string;
	query: Record<string, string>;
	body: unknown;
	name: string;
};

export type LogAppContext = {
	org_id?: string;
	org_slug?: string;
	env?: string;
	auth_type?: string;
	customer_id?: string;
	entity_id?: string;
	user_id?: string;
	user_email?: string;
	api_version?: string;
	scopes?: string[];
	full_subject_bucket?: number;
	full_subject_rollout_enabled?: boolean;
};

export type LogTriggerContext = {
	run_id: string;
	task_id: string;
	attempt_number?: number;
};
