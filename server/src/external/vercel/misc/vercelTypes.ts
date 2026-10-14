export type VercelBillingPlan = {
	id: string;
	type: "prepayment" | "subscription";
	name: string;
	scope?: "installation" | "resource";
	description: string;
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

type VercelInstallation = {
	billingPlan: {
		id: string;
		type: "prepayment" | "subscription";
		name: string;
		scope?: "installation" | "resource";
		description: string;
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
	notification: VercelNotification;
};

export type VercelNotification = {
	level: "info" | "warn" | "error";
	title: string;
	message?: string;
	href?: string;
} | null;

export type VercelUpsertInstallation = {
	scopes: Array<
		| "read-write:marketplace"
		| "read:integration-configuration"
		| "read-write:integration-resource"
	>;
	acceptedPolicies: {
		eula?: string;
		privacy?: string;
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

type VercelResource = {
	id: string;
	productId: string;
	protocolSettings?: {
		experimentation?: {
			edgeConfigSyncingEnabled?: boolean;
			edgeConfigId?: string;
			edgeConfigTokenId?: string;
		};
	};
	billingPlan?: {
		id: string;
		type: "prepayment" | "subscription";
		name: string;
		scope?: "installation" | "resource";
		description: string;
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
	name: string;
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
	}>;
};

type VercelMarketplaceInvoice = {
	configuration: {
		id: string;
	};
	installationId: string;
	invoiceId: string;
	externalInvoiceId: string | null;
	period: {
		start: string;
		end: string;
	};
	invoiceDate: string;
	invoiceTotal: string;
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
