import type { Balances } from "@useautumn/sdk/models";

/**
 * Response from the /check endpoint
 */
export interface CheckResponse {
	allowed: boolean;
	customerId: string;
	entityId?: string | null;
	requiredBalance: number;
	balance: Balances | null;
	preview?: CheckPreview;
}

export interface CheckPreview {
	// Add preview fields as needed
	[key: string]: unknown;
}
