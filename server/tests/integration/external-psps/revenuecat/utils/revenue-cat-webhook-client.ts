import type { AppEnv } from "@autumn/shared";

type RevenueCatEventType =
	| "INITIAL_PURCHASE"
	| "RENEWAL"
	| "CANCELLATION"
	| "UNCANCELLATION"
	| "EXPIRATION"
	| "NON_RENEWING_PURCHASE"
	| "BILLING_ISSUE"
	| "PRODUCT_CHANGE"
	| "TRANSFER";

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

export interface RevenueCatMockFixtures {
	subscriptions?: unknown[];
	purchases?: unknown[];
	products?: unknown[];
}

interface RevenueCatWebhookClientConfig {
	orgId: string;
	env: AppEnv;
	webhookSecret: string;
	baseUrl?: string;
}

export class RevenueCatWebhookClient {
	private orgId: string;
	private env: AppEnv;
	private webhookSecret: string;
	private baseUrl: string;

	constructor({
		orgId,
		env,
		webhookSecret,
		baseUrl = process.env.AUTUMN_TEST_BASE_URL || "http://localhost:8080",
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
		mock,
		subscriberAttributes,
	}: {
		type: RevenueCatEventType;
		event: Record<string, unknown>;
		mock?: RevenueCatMockFixtures;
		subscriberAttributes?: Record<string, string>;
	}): Promise<{ response: Response; data: unknown }> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: this.webhookSecret,
		};

		const subscriber_attributes = subscriberAttributes
			? Object.fromEntries(
					Object.entries(subscriberAttributes).map(([key, value]) => [
						key,
						{ updated_at_ms: Date.now(), value },
					]),
				)
			: undefined;

		if (mock) {
			headers["x-mock-revenuecat"] = "true";
			headers["x-mock-revenuecat-fixtures"] = JSON.stringify(mock);
		}

		const response = await fetch(this.webhookUrl, {
			method: "POST",
			body: JSON.stringify({
				event: {
					type,
					...event,
					...(subscriber_attributes ? { subscriber_attributes } : {}),
				},
			}),
			headers,
		});

		const data = await response.json();
		return { response, data };
	}

	async initialPurchase({
		productId,
		appUserId,
		originalAppUserId,
		originalTransactionId,
		transactionId,
		price,
		currency,
		purchasedAtMs,
		expirationAtMs,
		mock,
		subscriberAttributes,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		originalTransactionId?: string;
		transactionId?: string;
		price?: number | null;
		currency?: string;
		purchasedAtMs?: number;
		expirationAtMs?: number;
		mock?: RevenueCatMockFixtures;
		subscriberAttributes?: Record<string, string>;
	}) {
		return this.sendEvent({
			type: "INITIAL_PURCHASE",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				original_transaction_id:
					originalTransactionId ??
					`tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				transaction_id: transactionId,
				price,
				currency,
				purchased_at_ms: purchasedAtMs,
				expiration_at_ms: expirationAtMs,
			},
			mock,
			subscriberAttributes,
		});
	}

	async renewal({
		productId,
		appUserId,
		originalAppUserId,
		originalTransactionId,
		transactionId,
		price,
		currency,
		purchasedAtMs,
		expirationAtMs,
		subscriberAttributes,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		originalTransactionId?: string;
		transactionId?: string;
		price?: number | null;
		currency?: string;
		purchasedAtMs?: number;
		expirationAtMs?: number;
		subscriberAttributes?: Record<string, string>;
	}) {
		return this.sendEvent({
			type: "RENEWAL",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				original_transaction_id:
					originalTransactionId ??
					`tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				transaction_id: transactionId,
				price,
				currency,
				purchased_at_ms: purchasedAtMs,
				expiration_at_ms: expirationAtMs,
			},
			subscriberAttributes,
		});
	}

	async cancellation({
		productId,
		appUserId,
		originalAppUserId,
		expirationAtMs,
		originalTransactionId,
		transactionId,
		cancelReason,
		price,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		expirationAtMs?: number;
		originalTransactionId?: string;
		transactionId?: string;
		cancelReason?: string;
		price?: number | null;
	}) {
		return this.sendEvent({
			type: "CANCELLATION",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				expiration_at_ms:
					expirationAtMs ?? Date.now() + 1000 * 60 * 60 * 24 * 30,
				original_transaction_id:
					originalTransactionId ??
					`tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				transaction_id: transactionId,
				cancel_reason: cancelReason,
				price,
			},
		});
	}

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
					originalTransactionId ??
					`tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			},
		});
	}

	async nonRenewingPurchase({
		productId,
		appUserId,
		originalAppUserId,
		originalTransactionId,
		transactionId,
		price,
		currency,
		purchasedAtMs,
		mock,
	}: {
		productId: string;
		appUserId: string;
		originalAppUserId?: string;
		originalTransactionId?: string;
		transactionId?: string;
		price?: number | null;
		currency?: string;
		purchasedAtMs?: number;
		mock?: RevenueCatMockFixtures;
	}) {
		return this.sendEvent({
			type: "NON_RENEWING_PURCHASE",
			event: {
				product_id: productId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				original_transaction_id:
					originalTransactionId ??
					`tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				transaction_id: transactionId,
				price,
				currency,
				purchased_at_ms: purchasedAtMs,
			},
			mock,
		});
	}

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
					originalTransactionId ??
					`tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			},
		});
	}

	async transfer({
		transferredFrom,
		transferredTo,
		mock,
		subscriberAttributes,
	}: {
		transferredFrom: string[];
		transferredTo: string[];
		mock?: RevenueCatMockFixtures;
		subscriberAttributes?: Record<string, string>;
	}) {
		return this.sendEvent({
			type: "TRANSFER",
			event: {
				transferred_from: transferredFrom,
				transferred_to: transferredTo,
			},
			mock,
			subscriberAttributes,
		});
	}

	async productChange({
		productId,
		newProductId,
		appUserId,
		originalAppUserId,
		originalTransactionId,
		expirationAtMs,
		eventTimestampMs,
		store = "PLAY_STORE",
	}: {
		productId: string;
		newProductId: string;
		appUserId: string;
		originalAppUserId?: string;
		originalTransactionId?: string;
		expirationAtMs?: number;
		eventTimestampMs?: number;
		store?: string;
	}) {
		return this.sendEvent({
			type: "PRODUCT_CHANGE",
			event: {
				product_id: productId,
				new_product_id: newProductId,
				app_user_id: appUserId,
				original_app_user_id: originalAppUserId,
				original_transaction_id:
					originalTransactionId ??
					`tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				expiration_at_ms: expirationAtMs,
				event_timestamp_ms: eventTimestampMs ?? Date.now(),
				store,
			},
		});
	}
}

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
