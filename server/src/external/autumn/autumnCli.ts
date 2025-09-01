import dotenv from "dotenv";

dotenv.config();

import type { AttachBody } from "@autumn/shared";
import {
	type APIVersion,
	type CreateEntity,
	type CreateRewardProgram,
	CusExpand,
	EntityExpand,
	ErrCode,
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

export class AutumnInt {
	private apiKey: string;
	public headers: Record<string, string>;
	public baseUrl: string;

	constructor({
		apiKey,
		secretKey,
		baseUrl,
		version,
	}: {
		apiKey?: string;
		secretKey?: string;
		baseUrl?: string;
		version?: string | APIVersion;
	} = {}) {
		// this.apiKey = apiKey || process.env.AUTUMN_API_KEY || "";
		this.apiKey =
			apiKey || secretKey || process.env.UNIT_TEST_AUTUMN_SECRET_KEY || "";

		this.headers = {
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
		};

		if (version) {
			this.headers["x-api-version"] = version.toString();
		}

		this.baseUrl = baseUrl || "http://localhost:8080/v1";
	}

	async get(path: string) {
		const response = await fetch(`${this.baseUrl}${path}`, {
			headers: this.headers,
		});
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
			} catch (_error) {
				throw new AutumnError({
					message: "Failed to parse Autumn API error response",
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
			} catch (_error) {
				throw new AutumnError({
					message: "Failed to parse Autumn API error response",
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

	async attach(params: AttachBody) {
		// const data = await this.post(`/attach`, {
		//   customer_id: customerId,
		//   product_id: productId,
		//   options: toSnakeCase(options),
		// });
		const data = await this.post(`/attach`, params);

		return data;
	}
	async checkout(
		params: CheckoutParams & { invoice?: boolean; force_checkout?: boolean },
	) {
		// const data = await this.post(`/attach`, {
		//   customer_id: customerId,
		//   product_id: productId,
		//   options: toSnakeCase(options),
		// });
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

			const data = await this.get(
				`/customers/${customerId}?${queryParams.toString()}`,
			);
			return data;
		},

		create: async (customer: { id: string; email: string; name?: string }) => {
			const data = await this.post(`/customers?with_autumn_id=true`, customer);
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
	};

	entities = {
		get: async (customerId: string, entityId: string) => {
			const data = await this.get(
				`/customers/${customerId}/entities/${entityId}?expand=${EntityExpand.Invoices}`,
			);
			return data;
		},

		create: async (
			customerId: string,
			entity: CreateEntity | CreateEntity[],
		) => {
			// let entities = Array.isArray(entity) ? entity : [entity];
			const data = await this.post(
				`/customers/${customerId}/entities?with_autumn_id=true`,
				entity,
			);

			return data;
		},

		list: async (customerId: string) => {
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
			const data = await this.post(`/products/${productId}`, product);
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
			return data;
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
			testApiKey: string;
			liveApiKey: string;
			successUrl: string;
			defaultCurrency: string;
		}) => {
			const data = await this.post(`/org/stripe`, params);
			return data;
		},

		delete: async () => {
			const data = await this.delete(`/org/stripe`);
			return data;
		},
	};

	track = async (params: TrackParams & { timestamp?: number }) => {
		const data = await this.post(`/track`, params);
		return data;
	};

	usage = async (params: UsageParams) => {
		const data = await this.post(`/usage`, params);
		return data;
	};

	check = async (params: CheckParams): Promise<CheckResult> => {
		const data = await this.post(`/check`, params);
		return data;
	};

	attachPreview = async (params: AttachBody) => {
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

	initStripe = async () => {
		await this.post(`/products/all/init_stripe`, {});
	};
}
