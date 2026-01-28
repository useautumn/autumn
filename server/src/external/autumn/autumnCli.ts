/** biome-ignore-all lint/suspicious/noExplicitAny: AutumnInt is used for internal testing & scripts */
import dotenv from "dotenv";

dotenv.config();

import {
	type ApiBaseEntity,
	type ApiCusFeatureV3,
	type ApiCusProductV3,
	type ApiEntityV0,
	type AttachBodyV0,
	type BalancesUpdateParams,
	type BillingResponse,
	type CheckQuery,
	type CreateBalanceParams,
	type CreateCustomerInternalOptions,
	type CreateCustomerParams,
	type CreateEntityParams,
	type CreateRewardProgram,
	CusExpand,
	EntityExpand,
	ErrCode,
	type LegacyVersion,
	type OrgConfig,
	type RewardRedemption,
	type TrackParams,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { defaultApiVersion } from "@tests/constants.js";
import type {
	CancelParams,
	CheckoutParams,
	CheckoutResult,
	CheckParams,
	CheckResult,
	Customer,
	UsageParams,
} from "autumn-js";

export default class AutumnError extends Error {
	message: string;
	code: string;

	constructor({ message, code }: { message: string; code: string }) {
		super(message);
		this.message = message;
		this.code = code;
	}

	toString(): string {
		return `${this.message} (code: ${this.code})`;
	}
}

export class AutumnInt {
	private apiKey: string;
	public headers: Record<string, string>;
	public baseUrl: string;

	constructor({
		apiKey,
		secretKey,
		baseUrl,
		version,
		orgConfig,
		liveUrl = false,
		skipCacheDeletion = false,
	}: {
		apiKey?: string;
		secretKey?: string;
		baseUrl?: string;
		version?: string | LegacyVersion;
		orgConfig?: Partial<OrgConfig>;
		liveUrl?: boolean;
		skipCacheDeletion?: boolean;
	} = {}) {
		// this.apiKey = apiKey || process.env.AUTUMN_API_KEY || "";
		this.apiKey =
			apiKey || secretKey || process.env.UNIT_TEST_AUTUMN_SECRET_KEY || "";

		this.headers = {
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
		};

		if (version) {
			this.headers["x-api-version"] = version.toString() || defaultApiVersion;
		}

		if (orgConfig) {
			this.headers["org-config"] = JSON.stringify(orgConfig);
		}

		this.baseUrl =
			baseUrl ||
			(liveUrl ? "https://api.useautumn.com/v1" : "http://localhost:8080/v1");

		if (skipCacheDeletion) {
			this.headers["x-skip-cache-deletion"] = "true";
		}
	}

	async get(path: string) {
		const response = await fetch(`${this.baseUrl}${path}`, {
			headers: this.headers,
		});

		if (response.status !== 200) {
			// Handle rate limit errors
			if (response.status === 429) {
				throw new AutumnError({
					message: `request failed, rate limit exceeded`,
					code: "rate_limit_exceeded",
				});
			}

			let error: any;
			try {
				error = await response.json();
			} catch (error) {
				throw new AutumnError({
					message: `request failed, error: ${error}`,
					code: ErrCode.InternalError,
				});
			}

			throw new AutumnError({
				message: error.message,
				code: error.code,
			});
		}

		return response.json();
	}

	async post(path: string, body: any, headers?: Record<string, string>) {
		const response = await fetch(`${this.baseUrl}${path}`, {
			method: "POST",
			headers: { ...this.headers, ...headers },
			body: JSON.stringify(body),
		});

		if (response.status !== 200) {
			// Handle rate limit errors
			if (response.status === 429) {
				throw new AutumnError({
					message: `request failed, rate limit exceeded`,
					code: "rate_limit_exceeded",
				});
			}

			let error: any;
			try {
				error = await response.json();
			} catch (error) {
				throw new AutumnError({
					message: `request failed, error: ${error}`,
					code: ErrCode.InternalError,
				});
			}

			throw new AutumnError({
				message: error.message,
				code: error.code,
			});
		}

		return response.json();
	}
	async patch(path: string, body: any) {
		const response = await fetch(`${this.baseUrl}${path}`, {
			method: "PATCH",
			headers: this.headers,
			body: JSON.stringify(body),
		});

		if (response.status !== 200) {
			// Handle rate limit errors
			if (response.status === 429) {
				throw new AutumnError({
					message: `request failed, rate limit exceeded`,
					code: "rate_limit_exceeded",
				});
			}

			let error: any;
			try {
				error = await response.json();
			} catch (error) {
				throw new AutumnError({
					message: `request failed, error: ${error}`,
					code: ErrCode.InternalError,
				});
			}

			throw new AutumnError({
				message: error.message,
				code: error.code,
			});
		}

		return response.json();
	}

	async delete(
		path: string,
		{
			deleteInStripe = false,
		}: {
			deleteInStripe?: boolean;
		} = {},
	) {
		const response = await fetch(
			`${this.baseUrl}${path}?${deleteInStripe ? "delete_in_stripe=true" : ""}`,
			{
				method: "DELETE",
				headers: this.headers,
			},
		);

		if (response.status !== 200) {
			let error: any;
			try {
				error = await response.json();
			} catch (error) {
				throw new AutumnError({
					message: `AutumnInt delete request failed, error: ${error}`,
					code: ErrCode.InternalError,
				});
			}

			throw new AutumnError({
				message: error.message,
				code: error.code,
			});
		}

		return response.json();
	}

	async createCustomer({
		id,
		email,
		name,
		fingerprint,
	}: {
		id: string;
		email: string;
		name: string;
		fingerprint?: string;
	}) {
		const data = await this.post("/customers", {
			id,
			email,
			name,
			fingerprint,
		});

		return data;
	}

	async attach(
		params: AttachBodyV0,
		{
			skipWebhooks,
			idempotencyKey,
		}: { skipWebhooks?: boolean; idempotencyKey?: string } = {},
	) {
		const headers: Record<string, string> = {};
		if (skipWebhooks !== undefined) {
			headers["x-skip-webhooks"] = skipWebhooks ? "true" : "false";
		}
		if (idempotencyKey !== undefined) {
			headers["idempotency-key"] = idempotencyKey;
		}

		const data = await this.post(
			`/attach`,
			params,
			Object.keys(headers).length > 0 ? headers : undefined,
		);

		return data;
	}

	async updateCusEnt({
		customerId,
		customerEntitlementId,
		updates,
	}: {
		customerId: string;
		customerEntitlementId: string;
		updates: {
			balance?: number;
			next_reset_at?: number;
			entity_id?: string;
		};
	}) {
		const data = await this.post(
			`/customers/${customerId}/entitlements/${customerEntitlementId}`,
			updates,
		);
		return data;
	}

	async checkout(
		params: CheckoutParams & { invoice?: boolean; force_checkout?: boolean },
	) {
		const data = await this.post(`/checkout`, params);

		return data as CheckoutResult;
	}
	async transfer(
		customerId: string,
		params: {
			from_entity_id?: string;
			to_entity_id: string;
			product_id: string;
		},
	) {
		const data = await this.post(`/customers/${customerId}/transfer`, params);

		return data as CheckoutResult;
	}

	async sendEvent({
		customerId,
		eventName,
		properties,
		customer_data,
		idempotency_key,
	}: {
		customerId: string;
		eventName: string;
		properties?: any;
		customer_data?: any;
		idempotency_key?: string;
	}) {
		const data = await this.post(`/events`, {
			customer_id: customerId,
			event_name: eventName,
			properties,
			customer_data,
			idempotency_key,
		});

		return data;
	}

	async entitled({
		customerId,
		featureId,
		quantity,
		customer_data,
	}: {
		customerId: string;
		featureId: string;
		quantity?: number;
		customer_data?: any;
	}) {
		const data = await this.post(`/entitled`, {
			customer_id: customerId,
			feature_id: featureId,
			quantity,
			customer_data,
		});

		return data;
	}

	customers = {
		list: async (params?: { limit?: number; offset?: number }) => {
			const data = await this.get(
				`/customers?${new URLSearchParams(params as Record<string, string>).toString()}`,
			);
			return data;
		},

		listV2: async (params?: {
			limit?: number;
			offset?: number;
			search?: string;
			plans?: Array<{ id: string; versions?: number[] }>;
			subscription_status?: string[];
		}) => {
			const data = await this.post(`/customers/list`, params || {});
			return data;
		},

		get: async <
			T = Customer & {
				invoices: any[];
				autumn_id?: string;
				entities?: ApiBaseEntity[];
			},
		>(
			customerId: string,
			params?: {
				expand?: CusExpand[];
				skip_cache?: string;
				with_autumn_id?: boolean;
			},
		): Promise<T> => {
			const queryParams = new URLSearchParams();
			const defaultParams = {
				expand: [CusExpand.Invoices],
			};

			const finalParams = { ...defaultParams, ...params };
			if (finalParams.expand) {
				queryParams.append("expand", finalParams.expand.join(","));
			}
			if (finalParams.skip_cache) {
				queryParams.append("skip_cache", finalParams.skip_cache);
			}
			if (finalParams.with_autumn_id) {
				queryParams.append(
					"with_autumn_id",
					finalParams.with_autumn_id ? "true" : "false",
				);
			}
			const data = await this.get(
				`/customers/${customerId}?${queryParams.toString()}`,
			);
			return data;
		},

		create: async ({
			withAutumnId = true,
			expand = [],
			internalOptions = {
				disable_defaults: true,
			},
			skipWebhooks,
			...customerData
		}: {
			withAutumnId?: boolean;
			expand?: CusExpand[];
			internalOptions?: CreateCustomerInternalOptions;
			skipWebhooks?: boolean;
		} & Omit<CreateCustomerParams, "internal_options">) => {
			const headers: Record<string, string> = {};
			if (skipWebhooks !== undefined) {
				headers["x-skip-webhooks"] = skipWebhooks ? "true" : "false";
			}

			const data = await this.post(
				`/customers?with_autumn_id=${withAutumnId ? "true" : "false"}${expand && expand.length > 0 ? `&expand=${expand.join(",")}` : ""}`,
				{
					...customerData,
					internal_options: internalOptions,
				},
				Object.keys(headers).length > 0 ? headers : undefined,
			);
			return data;
		},
		delete: async (
			customerId: string,
			{
				deleteInStripe = false,
			}: {
				deleteInStripe?: boolean;
			} = {},
		) => {
			const data = await this.delete(`/customers/${customerId}`, {
				deleteInStripe,
			});
			return data;
		},

		update: async (
			customerId: string,
			updates: {
				name?: string;
				email?: string;
				send_email_receipts?: boolean;
				metadata?: Record<string, unknown>;
			},
		) => {
			const data = await this.patch(`/customers/${customerId}`, updates);
			return data;
		},

		setBalance: async ({
			customerId,
			balances,
			entityId,
		}: {
			customerId: string;
			balances: Array<{ feature_id: string; balance: number }>;
			entityId?: string;
		}) => {
			const data = await this.post(`/customers/${customerId}/balances`, {
				balances,
				entity_id: entityId,
			});
			return data;
		},
	};

	entities = {
		get: async <
			T = ApiEntityV0 & {
				features: Record<string, ApiCusFeatureV3>;
				products: ApiCusProductV3[];
			},
		>(
			customerId: string,
			entityId: string,
			params?: {
				expand?: EntityExpand[];
				skip_cache?: string;
			},
		): Promise<T> => {
			const queryParams = new URLSearchParams();
			const defaultParams = {
				expand: [EntityExpand.Invoices],
			};

			const finalParams = { ...defaultParams, ...params };
			if (finalParams.expand) {
				queryParams.append("expand", finalParams.expand.join(","));
			}
			if (finalParams.skip_cache) {
				queryParams.append("skip_cache", finalParams.skip_cache);
			}

			const data = await this.get(
				`/customers/${customerId}/entities/${entityId}?${queryParams.toString()}`,
			);
			return data as T;
		},

		create: async (
			customerId: string,
			entity: CreateEntityParams | CreateEntityParams[],
		) => {
			// let entities = Array.isArray(entity) ? entity : [entity];
			const data = await this.post(
				`/customers/${customerId}/entities?with_autumn_id=true`,
				entity,
			);

			return data;
		},

		list: async (customerId: string): Promise<ApiEntityV0[]> => {
			const data = await this.get(`/customers/${customerId}/entities`);
			return data;
		},

		delete: async (customerId: string, entityId: string) => {
			const data = await this.delete(
				`/customers/${customerId}/entities/${entityId}`,
			);
			return data;
		},
	};

	products = {
		update: async (productId: string, product: any) => {
			// if (product.items && typeof product.items === "object") {
			//   product.items = Object.values(product.items);
			// }
			const data = await this.patch(`/products/${productId}`, product);
			return data;
		},

		get: async (
			productId: string,
			{ v1Schema = false }: { v1Schema?: boolean } = {},
		) => {
			const data = await this.get(
				`/products/${productId}?${v1Schema ? "schemaVersion=1" : ""}`,
			);
			return data;
		},

		create: async (product: any) => {
			const data = await this.post(`/products`, product);
			return data;
		},

		delete: async (productId: string) => {
			const data = await this.delete(`/products/${productId}`);
			return data;
		},
	};

	rewards = {
		get: async (rewardId: string) => {
			const data = await this.get(`/rewards/${rewardId}`);
			return data;
		},

		create: async (reward: any) => {
			const data = await this.post(`/rewards?legacyStripe=true`, reward);
			return data;
		},

		delete: async (rewardId: string) => {
			const data = await this.delete(`/rewards/${rewardId}`);
			return data;
		},
	};

	rewardPrograms = {
		create: async (rewardProgram: CreateRewardProgram) => {
			const data = await this.post(`/reward_programs`, rewardProgram);
			return data;
		},
	};

	referrals = {
		createCode: async ({
			customerId,
			referralId,
		}: {
			customerId: string;
			referralId: string;
		}) => {
			const data = await this.post(`/referrals/code`, {
				customer_id: customerId,
				program_id: referralId,
			});
			return data;
		},
		redeem: async ({
			customerId,
			code,
		}: {
			customerId: string;
			code: string;
		}) => {
			const data = await this.post(`/referrals/redeem`, {
				customer_id: customerId,
				code,
			});
			return data;
		},
	};

	redemptions = {
		get: async (redemptionId: string) => {
			const data = await this.get(`/redemptions/${redemptionId}`);
			return data as RewardRedemption;
		},
	};

	events = {
		send: async ({
			customerId,
			featureId,
			value,
			properties,
		}: {
			customerId: string;
			featureId: string;
			value: number;
			properties?: any;
		}) => {
			const data = await this.post(`/events`, {
				customer_id: customerId,
				feature_id: featureId,
				value,
				properties,
			});
			return data;
		},
	};

	stripe = {
		connect: async (params: {
			secret_key: string;
			success_url: string;
			default_currency: string;
		}) => {
			const data = await this.post(`/organization/stripe`, params);
			return data;
		},

		delete: async () => {
			const data = await this.delete(`/organization/stripe`);
			return data;
		},
	};

	organization = {
		resetDefaultAccount: async () => {
			const data = await this.post(`/organization/reset_default_account`, {});
			return data;
		},
	};

	track = async (
		params: TrackParams,
		{
			skipCache = false,
			timeout,
		}: { skipCache?: boolean; timeout?: number } = {},
	) => {
		const queryParams = new URLSearchParams();
		if (skipCache) {
			queryParams.append("skip_cache", "true");
		}

		const data = await this.post(`/track?${queryParams.toString()}`, params);

		if (timeout) {
			await new Promise((resolve) => setTimeout(resolve, timeout));
		}
		return data;
	};

	usage = async (params: UsageParams) => {
		const data = await this.post(`/usage`, params);
		return data;
	};

	check = async <T = CheckResult>(
		params: CheckParams & CheckQuery & { skip_event?: boolean },
	): Promise<T> => {
		const queryParams = new URLSearchParams();
		if (params.skip_cache) {
			queryParams.append("skip_cache", "true");
		}

		const data = await this.post(`/check?${queryParams.toString()}`, params);
		return data;
	};

	attachPreview = async (params: AttachBodyV0) => {
		const data = await this.post(`/attach/preview`, params);
		return data;
	};

	cancel = async (params: CancelParams) => {
		const data = await this.post(`/cancel`, params);
		return data;
	};

	migrate = async (params: {
		from_product_id: string;
		to_product_id: string;
		from_version: number;
		to_version: number;
	}) => {
		const data = await this.post(`/migrations`, params);
		return data;
	};

	balances = {
		create: async (params: CreateBalanceParams) => {
			const data = await this.post(`/balances/create`, params);
			return data;
		},
		list: async (params: { customer_id: string }) => {
			const data = await this.get(
				`/balances/list?customer_id=${params.customer_id}`,
			);
			return data;
		},
		update: async (params: BalancesUpdateParams) => {
			const data = await this.post(`/balances/update`, params);
			return data;
		},
	};

	subscriptions = {
		update: async (
			params: UpdateSubscriptionV0Params,
			{
				timeout,
				skipWebhooks,
			}: { timeout?: number; skipWebhooks?: boolean } = {},
		): Promise<BillingResponse> => {
			const headers: Record<string, string> = {};
			if (skipWebhooks !== undefined) {
				headers["x-skip-webhooks"] = skipWebhooks ? "true" : "false";
			}

			const data = await this.post(
				`/subscriptions/update`,
				params,
				Object.keys(headers).length > 0 ? headers : undefined,
			);
			if (timeout) {
				await new Promise((resolve) => setTimeout(resolve, timeout));
			}
			return data;
		},

		previewUpdate: async (params: UpdateSubscriptionV0Params) => {
			const data = await this.post(`/subscriptions/preview_update`, params);
			return data;
		},
	};
}
