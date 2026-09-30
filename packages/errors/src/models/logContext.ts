/** The slice of a log line's bindings + fields that says who and where; set by addAppContextToLogs etc. */
export type LogContext = {
	context?: {
		org_id?: string;
		org_slug?: string;
		env?: string;
		customer_id?: string;
		entity_id?: string;
	};
	req?: { id?: string; name?: string };
	workflow?: { id?: string; name?: string };
};
