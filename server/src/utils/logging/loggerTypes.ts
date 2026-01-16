import type { AppEnv, AuthType } from "@autumn/shared";

/** Request-level metadata - goes under context.req */
export type LogRequestContext = {
	id: string;
	method: string;
	url: string;
	timestamp: number;

	user_agent?: string;
	ip_address?: string;

	// New fields
	query: Record<string, string>;
	body: unknown;

	name: string;
};

/** App context - org, customer, auth - goes under context.context */
export type LogAppContext = {
	org_id: string;
	org_slug: string;
	env: AppEnv;
	auth_type: AuthType;

	customer_id?: string;
	user_id?: string;
	user_email?: string;
	api_version: string;
};

/** Stripe webhook event context */
export type LogStripeEventContext = {
	id: string;
	type: string;
	object_id: string;
};

/** Background worker context */
export type LogWorkflowContext = {
	id: string;
	payload: unknown;
	name: string; // workflow / job name
};
