/**
 * Vercel Billing Plans API type
 */
export type VercelBillingPlan = {
	id: string; // Partner-provided billing plan. Example: "pro200"
	type: "prepayment" | "subscription";
	name: string; // Name of the plan. Example: "Hobby"
	scope?: "installation" | "resource"; // default: "resource"
	description: string; // Example: "Use all you want up to 20G"
	paymentMethodRequired?: boolean; // default: true
	preauthorizationAmount?: number; // Only for subscription if paymentMethodRequired is true
	initialCharge?: string; // Only for subscription if paymentMethodRequired is true
	minimumAmount?: string; // Only for prepayment
	maximumAmount?: string; // Only for prepayment
	maximumAmountAutoPurchasePerPeriod?: string; // Only for prepayment
	cost?: string; // Only relevant for fixed-cost plans
	details?: Array<{
		label: string;
		value?: string;
	}>; // Plan's details
	highlightedDetails?: Array<{
		label: string;
		value?: string;
	}>; // Highlighted plan's details
	quote?: Array<{
		line: string;
		amount: string;
	}>; // Deprecated. Use `details` instead.
	effectiveDate?: string; // ISO date-time format
	disabled?: boolean; // If true, plan cannot be selected
};

/**
 * Vercel Installation type for Vercel Billing endpoints.
 */
export type VercelInstallation = {
	billingPlan: {
		id: string; // Partner-provided billing plan. Example: "pro200"
		type: "prepayment" | "subscription";
		name: string; // Name of the plan. Example: "Hobby"
		scope?: "installation" | "resource"; // default: "resource"
		description: string; // Example: "Use all you want up to 20G"
		paymentMethodRequired?: boolean; // Only used if plan type is `subscription`. Set false for free plans
		preauthorizationAmount?: number; // Only for subscription if paymentMethodRequired is true
		initialCharge?: string; // Only for subscription if paymentMethodRequired is true
		minimumAmount?: string; // Only for prepayment
		maximumAmount?: string; // Only for prepayment
		maximumAmountAutoPurchasePerPeriod?: string; // Only for prepayment
		cost?: string; // Plan's cost, if available. Example: "$20.00/month"
		details?: Array<{
			label: string;
			value?: string;
		}>; // Plan's details
		highlightedDetails?: Array<{
			label: string;
			value?: string;
		}>; // Highlighted details
		quote?: Array<{
			line: string;
			amount: string;
		}>; // Deprecated. Use `details` instead
		effectiveDate?: string; // ISO date-time format for when the plan becomes effective
		disabled?: boolean; // If true, plan cannot be selected
	};
	notification: {
		level: "info" | "warn" | "error";
		title: string;
		message?: string;
		href?: string;
	} | null;
};

/**
 * Request body for upserting a Vercel Integration Installation.
 */
export type VercelUpsertInstallation = {
	scopes: Array<
		| "read-write:marketplace"
		| "read:integration-configuration"
		| "read-write:integration-resource"
	>;
	acceptedPolicies: {
		eula?: string; // ISO date-time string
		privacy?: string; // ISO date-time string
	};
	credentials: {
		access_token: string;
		token_type: string;
	};
	account: {
		name: string;
		url: string;
		contact: {
			email: string;
			name: string;
		};
	};
};
