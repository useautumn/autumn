/** biome-ignore-all lint/suspicious/noExplicitAny: AutumnCliV2 is used for internal testing & scripts */
import dotenv from "dotenv";

dotenv.config();

import {
	type AttachBody,
	type CreateEntity,
	type CreateRewardProgram,
	CusExpand,
	EntityExpand,
	ErrCode,
	type OrgConfig,
	type RewardRedemption,
} from "@autumn/shared";
import type {
	CancelParams,
	CheckoutParams,
	CheckoutResult,
	CheckParams,
	CheckResult,
	Customer,
	TrackParams,
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

/**
 * Robust Autumn API client (V2) with proper version handling
 *
 * Key improvements over V1:
 * - Properly respects x-api-version header for ALL requests
 * - No legacy v1Schema params
 * - Cleaner error handling
 * - Type-safe version parameter
 */
export class AutumnCliV2 {
	private apiKey: string;
	public headers: Record<string, string>;
	public baseUrl: string;
	public version?: string;

	constructor({
		apiKey,
		secretKey,
		baseUrl,
		version,
		orgConfig,
		liveUrl = false,
	}: {
		apiKey?: string;
		secretKey?: string;
		baseUrl?: string;
		version?: string;
		orgConfig?: Partial<OrgConfig>;
		liveUrl?: boolean;
	} = {}) {
		this.apiKey =
			apiKey || secretKey || process.env.UNIT_TEST_AUTUMN_SECRET_KEY || "";

		this.headers = {
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
		};

		this.version = version;

		if (version) {
			this.headers["x-api-version"] = version;
		}

		if (orgConfig) {
			this.headers["org-config"] = JSON.stringify(orgConfig);
		}

		this.baseUrl =
			baseUrl ||
			(liveUrl ? "https://api.useautumn.com/v1" : "http://localhost:8080/v1");
	}

	async get(path: string) {
		const response = await fetch(`${this.baseUrl}${path}`, {
			headers: this.headers,
		});

		if (response.status !== 200) {
			let error: any;
			try {
				error = await response.json();
			} catch (_e) {
				throw new AutumnError({
					message: `GET ${path} failed with status ${response.status}`,
					code: ErrCode.InternalError,
				});
			}

			throw new AutumnError({
				message: error.message || `GET ${path} failed`,
				code: error.code || ErrCode.InternalError,
			});
		}

		return response.json();
	}

	async post(path: string, body: any) {
		const response = await fetch(`${this.baseUrl}${path}`, {
			method: "POST",
			headers: this.headers,
			body: JSON.stringify(body),
		});

		if (response.status !== 200) {
			let error: any;
			try {
				error = await response.json();
			} catch (_e) {
				throw new AutumnError({
					message: `POST ${path} failed with status ${response.status}`,
					code: ErrCode.InternalError,
				});
			}

			throw new AutumnError({
				message: error.message || `POST ${path} failed`,
				code: error.code || ErrCode.InternalError,
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
		const queryParams = deleteInStripe ? "?delete_in_stripe=true" : "";
		const response = await fetch(`${this.baseUrl}${path}${queryParams}`, {
			method: "DELETE",
			headers: this.headers,
		});

		if (response.status !== 200) {
			let error: any;
			try {
				error = await response.json();
			} catch (_e) {
				throw new AutumnError({
					message: `DELETE ${path} failed with status ${response.status}`,
					code: ErrCode.InternalError,
				});
			}

			throw new AutumnError({
				message: error.message || `DELETE ${path} failed`,
				code: error.code || ErrCode.InternalError,
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
		return await this.post("/customers", {
			id,
			email,
			name,
			fingerprint,
		});
	}

	async attach(params: AttachBody) {
		return await this.post(`/attach`, params);
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
		return await this.post(`/events`, {
			customer_id: customerId,
			event_name: eventName,
			properties,
			customer_data,
			idempotency_key,
		});
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
		return await this.post(`/entitled`, {
			customer_id: customerId,
			feature_id: featureId,
			quantity,
			customer_data,
		});
	}

	customers = {
		list: async (params?: { limit?: number; offset?: number }) => {
			const queryString = params
				? `?${new URLSearchParams(params as Record<string, string>).toString()}`
				: "";
			return await this.get(`/customers${queryString}`);
		},

		get: async (
			customerId: string,
			params?: {
				expand?: CusExpand[];
			},
		): Promise<
			Customer & {
				invoices: any[];
			}
		> => {
			const queryParams = new URLSearchParams();
			const defaultParams = {
				expand: [CusExpand.Invoices],
			};

			const finalParams = { ...defaultParams, ...params };
			if (finalParams.expand) {
				queryParams.append("expand", finalParams.expand.join(","));
			}

			return await this.get(
				`/customers/${customerId}?${queryParams.toString()}`,
			);
		},

		create: async (customer: { id: string; email?: string; name?: string }) => {
			return await this.post(`/customers?with_autumn_id=true`, customer);
		},

		delete: async (
			customerId: string,
			{
				deleteInStripe = false,
			}: {
				deleteInStripe?: boolean;
			} = {},
		) => {
			return await this.delete(`/customers/${customerId}`, {
				deleteInStripe,
			});
		},
	};

	entities = {
		get: async (customerId: string, entityId: string) => {
			return await this.get(
				`/customers/${customerId}/entities/${entityId}?expand=${EntityExpand.Invoices}`,
			);
		},

		create: async (
			customerId: string,
			entity: CreateEntity | CreateEntity[],
		) => {
			return await this.post(
				`/customers/${customerId}/entities?with_autumn_id=true`,
				entity,
			);
		},

		list: async (customerId: string) => {
			return await this.get(`/customers/${customerId}/entities`);
		},

		delete: async (customerId: string, entityId: string) => {
			return await this.delete(`/customers/${customerId}/entities/${entityId}`);
		},
	};

	products = {
		/**
		 * Get product - respects x-api-version header set in constructor
		 */
		get: async (productId: string) => {
			return await this.get(`/products/${productId}`);
		},

		/**
		 * Create product - respects x-api-version header
		 */
		create: async (product: any) => {
			return await this.post(`/products`, product);
		},

		/**
		 * Update product - respects x-api-version header
		 */
		update: async (productId: string, product: any) => {
			return await this.post(`/products/${productId}`, product);
		},

		/**
		 * Delete product
		 */
		delete: async (productId: string) => {
			return await this.delete(`/products/${productId}`);
		},

		/**
		 * List products - respects x-api-version header
		 */
		list: async (params?: { limit?: number; offset?: number }) => {
			const queryString = params
				? `?${new URLSearchParams(params as Record<string, string>).toString()}`
				: "";
			return await this.get(`/products${queryString}`);
		},
	};

	rewards = {
		get: async (rewardId: string) => {
			return await this.get(`/rewards/${rewardId}`);
		},

		create: async (reward: any) => {
			return await this.post(`/rewards?legacyStripe=true`, reward);
		},

		delete: async (rewardId: string) => {
			return await this.delete(`/rewards/${rewardId}`);
		},
	};

	rewardPrograms = {
		create: async (rewardProgram: CreateRewardProgram) => {
			return await this.post(`/reward_programs`, rewardProgram);
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
			return await this.post(`/referrals/code`, {
				customer_id: customerId,
				program_id: referralId,
			});
		},

		redeem: async ({
			customerId,
			code,
		}: {
			customerId: string;
			code: string;
		}) => {
			return await this.post(`/referrals/redeem`, {
				customer_id: customerId,
				code,
			});
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
			return await this.post(`/events`, {
				customer_id: customerId,
				feature_id: featureId,
				value,
				properties,
			});
		},
	};

	stripe = {
		connect: async (params: {
			secret_key: string;
			success_url: string;
			default_currency: string;
		}) => {
			return await this.post(`/organization/stripe`, params);
		},

		delete: async () => {
			return await this.delete(`/organization/stripe`);
		},
	};

	track = async (params: TrackParams & { timestamp?: number }) => {
		return await this.post(`/track`, params);
	};

	usage = async (params: UsageParams) => {
		return await this.post(`/usage`, params);
	};

	check = async (params: CheckParams): Promise<CheckResult> => {
		return await this.post(`/check`, params);
	};

	attachPreview = async (params: AttachBody) => {
		return await this.post(`/attach/preview`, params);
	};

	cancel = async (params: CancelParams) => {
		return await this.post(`/cancel`, params);
	};

	migrate = async (params: {
		from_product_id: string;
		to_product_id: string;
		from_version: number;
		to_version: number;
	}) => {
		return await this.post(`/migrations`, params);
	};

	initStripe = async () => {
		await this.post(`/products/all/init_stripe`, {});
	};
}
