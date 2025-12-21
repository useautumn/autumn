import type { AppEnv } from "@autumn/shared";

type RevenueCatEventType =
	| "INITIAL_PURCHASE"
	| "RENEWAL"
	| "CANCELLATION"
	| "UNCANCELLATION"
	| "EXPIRATION"
	| "NON_RENEWING_PURCHASE"
	| "BILLING_ISSUE"
	| "PRODUCT_CHANGE";

interface BaseWebhookEvent {
	product_id: string;
	app_user_id: string;
	original_app_user_id?: string;
	original_transaction_id?: string;
}

interface CancellationEvent extends BaseWebhookEvent {
	expiration_at_ms: number;
}

interface RenewalEvent extends BaseWebhookEvent {}

interface ExpirationEvent extends BaseWebhookEvent {
	expiration_at_ms?: number;
}

interface RevenueCatWebhookClientConfig {
	orgId: string;
	env: AppEnv;
	webhookSecret: string;
	baseUrl?: string;
}

/**
 * Mock client for sending RevenueCat webhook events in tests
 */
export class RevenueCatWebhookClient {
	private orgId: string;
	private env: AppEnv;
	private webhookSecret: string;
	private baseUrl: string;

	constructor({
		orgId,
		env,
		webhookSecret,
		baseUrl = "http://localhost:8080",
	}: RevenueCatWebhookClientConfig) {
		this.orgId = orgId;
		this.env = env;
		this.webhookSecret = webhookSecret;
		this.baseUrl = baseUrl;
	}

	private get webhookUrl(): string {
		return `${this.baseUrl}/webhooks/revenuecat/${this.orgId}/${this.env}`;
	}

	private async sendEvent({
		type,
		event,
	}: {
		type: RevenueCatEventType;
		event: Record<string, unknown>;
	}): Promise<{ response: Response; data: unknown }> {
		const response = await fetch(this.webhookUrl, {
			method: "POST",
			body: JSON.stringify({
				event: {
					type,
					...event,
				},
			}),
			headers: {
				"Content-Type": "application/json",
				Authorization: this.webhookSecret,
			},
		});

		const data = await response.json();
		return { response, data };
	}

	/**
	 * Send INITIAL_PURCHASE event - when a user first subscribes
	 */
	async initialPurchase({
		productId,
		appUserId,
		originalAppUserId,
		originalTransactionId,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		originalTransactionId?: string;
	}) {
		return this.sendEvent({
			type: "INITIAL_PURCHASE",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				original_transaction_id:
					originalTransactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			},
		});
	}

	/**
	 * Send RENEWAL event - when a subscription renews
	 */
	async renewal({
		productId,
		appUserId,
		originalAppUserId,
		originalTransactionId,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		originalTransactionId?: string;
	}) {
		return this.sendEvent({
			type: "RENEWAL",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				original_transaction_id:
					originalTransactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			},
		});
	}

	/**
	 * Send CANCELLATION event - when a user cancels their subscription
	 */
	async cancellation({
		productId,
		appUserId,
		originalAppUserId,
		expirationAtMs,
		originalTransactionId,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		expirationAtMs?: number;
		originalTransactionId?: string;
	}) {
		return this.sendEvent({
			type: "CANCELLATION",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				expiration_at_ms: expirationAtMs ?? Date.now() + 1000 * 60 * 60 * 24 * 30, // Default: 30 days
				original_transaction_id:
					originalTransactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			},
		});
	}

	/**
	 * Send UNCANCELLATION event - when a user resubscribes after cancelling
	 */
	async uncancellation({
		productId,
		appUserId,
		originalAppUserId,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
	}) {
		return this.sendEvent({
			type: "UNCANCELLATION",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
			},
		});
	}

	/**
	 * Send EXPIRATION event - when a subscription expires
	 */
	async expiration({
		productId,
		appUserId,
		originalAppUserId,
		expirationAtMs,
		originalTransactionId,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		expirationAtMs?: number;
		originalTransactionId?: string;
	}) {
		return this.sendEvent({
			type: "EXPIRATION",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				expiration_at_ms: expirationAtMs,
				original_transaction_id:
					originalTransactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			},
		});
	}

	/**
	 * Send NON_RENEWING_PURCHASE event - for one-time purchases (consumables, non-consumables)
	 */
	async nonRenewingPurchase({
		productId,
		appUserId,
		originalAppUserId,
		originalTransactionId,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		originalTransactionId?: string;
	}) {
		return this.sendEvent({
			type: "NON_RENEWING_PURCHASE",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				original_transaction_id:
					originalTransactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			},
		});
	}

	/**
	 * Send BILLING_ISSUE event - when there's a billing problem
	 */
	async billingIssue({
		productId,
		appUserId,
		originalAppUserId,
		originalTransactionId,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		originalTransactionId?: string;
	}) {
		return this.sendEvent({
			type: "BILLING_ISSUE",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				original_transaction_id:
					originalTransactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			},
		});
	}

	/**
	 * Send PRODUCT_CHANGE event - when a user changes their subscription
	 */
	async productChange({
		productId,
		newProductId,
		appUserId,
		originalAppUserId,
		originalTransactionId,
	}: {
		productId: string;
		newProductId: string;
		appUserId: string;
		originalAppUserId?: string;
		originalTransactionId?: string;
	}) {
		return this.sendEvent({
			type: "PRODUCT_CHANGE",
			event: {
				product_id: productId,
				new_product_id: newProductId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				original_transaction_id:
					originalTransactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			},
		});
	}
}

/**
 * Helper to assert webhook response is successful
 */
export const expectWebhookSuccess = ({
	response,
	data,
}: {
	response: Response;
	data: unknown;
}) => {
	if (response.status !== 200) {
		throw new Error(
			`Expected webhook response status 200, got ${response.status}. Data: ${JSON.stringify(data)}`,
		);
	}
	if ((data as { success?: boolean })?.success !== true) {
		throw new Error(
			`Expected webhook response { success: true }, got ${JSON.stringify(data)}`,
		);
	}
};

