import type * as models from "@useautumn/sdk/models";
import type { CustomerData } from "../../types/customerData";
import type { CreateCustomerParams, IAutumnClient } from "./ReactAutumnClient";

export interface ErrorResponse {
	message: string;
	code: string;
}

export type OmitCustomerType =
	| "id"
	| "name"
	| "email"
	| "fingerprint"
	| "customer_id";

export interface ConvexAutumnClientConfig {
	convexApi: any; // The exported autumn.api() object from Convex
	// convexUrl: string; // The Convex deployment URL
	customerData?: CustomerData;
	headers?: Record<string, string>;
	getBearerToken?: () => Promise<string | null>;
	convex: any;
}

export class ConvexAutumnClient implements IAutumnClient {
	protected readonly convexApi: any;
	protected readonly convex: any;
	// protected readonly convexClient: ConvexHttpClient;
	public readonly customerData?: CustomerData;
	public readonly headers?: Record<string, string>;
	public readonly backendUrl?: string = undefined;
	public readonly prefix: string = "/api/convex";
	public readonly getBearerToken?: () => Promise<string | null>;

	// Stub implementations for HTTP-specific methods that the interface requires
	async detectCors() {
		return {
			valid: true,
			includeCredentials: false as boolean | undefined,
		};
	}

	async shouldIncludeCredentials(): Promise<boolean> {
		return false;
	}

	async getHeaders() {
		return { "Content-Type": "application/json" };
	}

	async handleFetch() {
		throw new Error("HTTP methods not supported in Convex mode");
	}

	async post() {
		throw new Error("HTTP methods not supported in Convex mode");
	}

	async get() {
		throw new Error("HTTP methods not supported in Convex mode");
	}

	async delete() {
		throw new Error("HTTP methods not supported in Convex mode");
	}

	constructor({
		convexApi,
		customerData,
		headers,
		getBearerToken,
		convex,
	}: ConvexAutumnClientConfig) {
		this.convex = convex;
		this.convexApi = convexApi;
		// this.convexClient = new ConvexHttpClient(convexUrl);
		this.getBearerToken = getBearerToken;
		this.customerData = customerData;
		this.headers = headers;
	}

	customers = {
		getOrCreate: async (
			params: CreateCustomerParams,
		): Promise<models.Customer | null> => {
			return await this.convex.action(this.convexApi.createCustomer, params);
		},
	};

	// Core methods that wrap Convex actions
	attach = async (args: any) => {
		// Filter out frontend-only parameters
		const { dialog, ...backendArgs } = args;

		const result = await this.convex.action(this.convexApi.attach, backendArgs);
		return result;
	};

	checkout = async (args: any) => {
		// Filter out frontend-only parameters
		const { dialog, ...backendArgs } = args;

		const result = await this.convex.action(
			this.convexApi.checkout,
			backendArgs,
		);
		return result;
	};

	cancel = async (args: any) => {
		const result = await this.convex.action(this.convexApi.cancel, args);
		return result;
	};

	check = async (args: any) => {
		const result = await this.convex.action(this.convexApi.check, args);
		return result;
	};

	track = async (args: any) => {
		const result = await this.convex.action(this.convexApi.track, args);
		return result;
	};

	openBillingPortal = async (args: any) => {
		const result = await this.convex.action(this.convexApi.billingPortal, {
			...args,
			openInNewTab: undefined,
		});

		return result;
	};

	setupPayment = async (args: any) => {
		const result = await this.convex.action(this.convexApi.setupPayment, args);
		return result;
	};

	query = async (args: any) => {
		const result = await this.convex.action(this.convexApi.query, args);
		return result;
	};

	entities = {
		create: async (args: any) => {
			// Check if args is an array or single entity
			if (Array.isArray(args)) {
				// Multiple entities - use createEntities method
				throw new Error(
					"Passing an array of entities to createEntity() is not supported for Convex",
				);
				// const entityArgs = { entities: args };
				// const result = await this.convex.action(
				//   this.convexApi.createEntities,
				//   entityArgs
				// );
				// return result;
			} else {
				// Single entity - use createEntity method directly (no entities wrapper)
				const result = await this.convex.action(
					this.convexApi.createEntity,
					args,
				);
				return result;
			}
		},

		get: async (entityId: string, args: any) => {
			const result = await this.convex.action(this.convexApi.getEntity, {
				entityId,
				...args,
			});

			return result;
		},

		delete: async (args: any) => {
			// Set auth token for the request - backend will extract identity
			// 	if (this.getBearerToken) {
			// 	this.convexClient.setAuth(
			// 		(await this.getBearerToken()) ?? ""
			// 	);
			// }
			const result = await this.convex.action(
				this.convexApi.deleteEntity,
				args,
			);
			return result;
		},
	};

	referrals = {
		createCode: async (args: any) => {
			const result = await this.convex.action(
				this.convexApi.createReferralCode,
				args,
			);
			return result;
		},

		redeemCode: async (args: any) => {
			// Set auth token for the request - backend will extract identity
			// if (this.getBearerToken) {
			// 	this.convexClient.setAuth(
			// 		(await this.getBearerToken()) ?? ""
			// 	);
			// }
			const result = await this.convex.action(
				this.convexApi.redeemReferralCode,
				args,
			);
			return result;
		},
	};

	products = {
		list: async (): Promise<any> => {
			const result = await this.convex.action(this.convexApi.listProducts, {});
			return result;
		},
	};
}
