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
type VercelInstallation = {
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
	notification: VercelNotification;
};

export type VercelNotification = {
	level: "info" | "warn" | "error";
	title: string;
	message?: string;
	href?: string;
} | null;

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

/**
 * Type for a Vercel Provisioned Resource.
 * Represents all configuration and status for a user's provisioned integration resource.
 */
type VercelResource = {
	id: string; // The partner-specific ID of the resource
	productId: string; // The partner-specific ID/slug of the product, eg. "redis"
	protocolSettings?: {
		experimentation?: {
			edgeConfigSyncingEnabled?: boolean;
			edgeConfigId?: string;
			edgeConfigTokenId?: string;
		};
	};
	billingPlan?: {
		id: string; // eg. "pro200"
		type: "prepayment" | "subscription";
		name: string; // Plan name, eg. "Hobby"
		scope?: "installation" | "resource";
		description: string; // eg. "Use all you want up to 20G"
		paymentMethodRequired?: boolean;
		preauthorizationAmount?: number;
		initialCharge?: string;
		minimumAmount?: string;
		maximumAmount?: string;
		maximumAmountAutoPurchasePerPeriod?: string;
		cost?: string;
		details?: Array<{
			label: string;
			value?: string;
		}>;
		highlightedDetails?: Array<{
			label: string;
			value?: string;
		}>;
		quote?: Array<{
			line: string;
			amount: string;
		}>;
		effectiveDate?: string;
		disabled?: boolean;
	};
	name: string; // User-inputted name for the resource
	metadata: {
		[key: string]: string | number | boolean | string[] | number[];
	};
	status:
		| "ready"
		| "pending"
		| "onboarding"
		| "suspended"
		| "resumed"
		| "uninstalled"
		| "error";
	notification?: {
		level: "info" | "warn" | "error";
		title: string;
		message?: string;
		href?: string;
	} | null;
	secrets: Array<{
		name: string;
		value: string;
		prefix?: string;
		environmentOverrides?: {
			development?: string;
			preview?: string;
			production?: string;
		};
	}>; // Secret values for this resource
};

type VercelMarketplaceInvoice = {
	configuration: {
		id: string;
	};
	installationId: string;
	invoiceId: string;
	externalInvoiceId: string | null;
	period: {
		start: string; // ISO Date string
		end: string; // ISO Date string
	};
	invoiceDate: string; // ISO Date string
	invoiceTotal: string; // Decimal as string
};

export type VercelError = {
	error: {
		code: "validation_error";
		message: string;
		user?: {
			message: string;
			url?: string | null;
		} | null;
		fields?: Array<{
			key: string;
			message?: string | null;
		}> | null;
	};
};
