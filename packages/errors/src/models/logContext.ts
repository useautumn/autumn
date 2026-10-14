export type LogContext = {
	context?: {
		org_id?: string;
		org_slug?: string;
		env?: string;
		customer_id?: string;
		entity_id?: string;
	};
	req?: { id?: string; name?: string; route?: string };
	workflow?: { id?: string; name?: string };
	error_type?: string;
	type?: string;
};
