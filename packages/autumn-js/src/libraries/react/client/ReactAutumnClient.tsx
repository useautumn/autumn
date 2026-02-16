import type { Customer, CustomerExpand } from "@useautumn/sdk";
import { handleFetchResult } from "../../../utils/handleFetchResult";
import type { CustomerData } from "../../types/customerData";
import { logAuthError } from "../errorUtils/logAuthError";
import { logFetchError } from "../errorUtils/logFetchError";
import { createCustomerMethod } from "./clientCusMethods";
import {
	createEntityMethod,
	deleteEntityMethod,
	getEntityMethod,
} from "./clientEntityMethods";
import {
	attachMethod,
	cancelMethod,
	checkMethod,
	checkoutMethod,
	openBillingPortalMethod,
	queryMethod,
	setupPaymentMethod,
	trackMethod,
} from "./clientGenMethods";
import { listProductsMethod } from "./clientProdMethods";
import { createCode, redeemCode } from "./clientReferralMethods";

export interface ErrorResponse {
	message: string;
	code: string;
}

export type CreateCustomerParams = {
	expand?: CustomerExpand[];
	errorOnNotFound?: boolean;
};

export interface AutumnClientConfig {
	backendUrl?: string;
	getBearerToken?: () => Promise<string | null | undefined>;
	customerData?: CustomerData;
	includeCredentials?: boolean;
	betterAuthUrl?: string;
	headers?: Record<string, string>;
	pathPrefix?: string; // Optional API path prefix override
}

export interface IAutumnClient {
	readonly backendUrl?: string;
	readonly prefix: string;
	readonly headers?: Record<string, string>;
	readonly customerData?: CustomerData;

	customers: {
		getOrCreate(params: CreateCustomerParams): Promise<Customer | null>;
	};

	// HTTP methods (stubbed for Convex)
	detectCors(): Promise<{
		valid: boolean;
		includeCredentials: boolean | undefined;
	}>;
	shouldIncludeCredentials(): Promise<boolean>;
	getHeaders(): Promise<Record<string, string>>;
	handleFetch(options: {
		path: string;
		method: string;
		body?: any;
	}): Promise<any>;
	post(path: string, body: any): Promise<any>;
	get(path: string): Promise<any>;
	delete(path: string): Promise<any>;

	// Autumn methods
	attach(args: any): Promise<any>;
	checkout(args: any): Promise<any>;
	cancel(args: any): Promise<any>;
	check(args: any): Promise<any>;
	track(args: any): Promise<any>;
	openBillingPortal(args: any): Promise<any>;
	setupPayment(args: any): Promise<any>;
	query(args: any): Promise<any>;

	entities: {
		create(args: any): Promise<any>;
		get(entityId: string, args: any): Promise<any>;
		delete(args: any): Promise<any>;
	};

	referrals: {
		createCode(args: any): Promise<any>;
		redeemCode(args: any): Promise<any>;
	};

	products: {
		list(): Promise<any>;
	};
}

export class AutumnClient implements IAutumnClient {
	public readonly backendUrl?: string;
	protected readonly getBearerToken?: () => Promise<string | null | undefined>;
	public readonly customerData?: CustomerData;
	protected includeCredentials?: boolean;
	public readonly prefix: string;
	public readonly camelCase: boolean;
	public readonly headers?: Record<string, string>;
	public readonly framework?: string;

	constructor({
		backendUrl,
		getBearerToken,
		customerData,
		includeCredentials,
		betterAuthUrl,
		headers,
		pathPrefix,
	}: AutumnClientConfig) {
		this.backendUrl = backendUrl;
		this.getBearerToken = getBearerToken;
		this.customerData = customerData;
		this.includeCredentials = includeCredentials;
		this.prefix = "/api/autumn";
		let camelCase = false;

		if (betterAuthUrl) {
			this.prefix = "/api/auth/autumn";
			this.backendUrl = betterAuthUrl;
			camelCase = true;
		}

		// If an explicit prefix is provided, prefer it over defaults
		const providedPrefix = pathPrefix;
		if (providedPrefix) {
			// Normalize: ensure leading '/', collapse multiple '/', remove trailing '/'
			const normalized = `/${providedPrefix}`
				.replace(/\/+/g, "/")
				.replace(/\/$/, "");
			this.prefix = normalized;
		}

		this.headers = headers;

		// Feature-flags for input camelCase:
		if (betterAuthUrl) camelCase = true;
		this.camelCase = camelCase;
	}

	/**
	 * Detects if the backend supports CORS credentials by making an OPTIONS request
	 */
	public async detectCors() {
		if (this.prefix?.includes("/api/auth")) {
			return { valid: true, includeCredentials: true };
		}

		const testEndpoint = `${this.backendUrl}${this.prefix}/cors`;

		// Test 1: With credentials
		try {
			await fetch(testEndpoint, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			return { valid: true, includeCredentials: true };
		} catch (_) {
			// Test 2: Without credentials
			try {
				await fetch(testEndpoint, {
					method: "POST",
					credentials: "omit",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				});

				return { valid: true, includeCredentials: false };
			} catch (_) {
				return { valid: false, includeCredentials: undefined };
			}
		}
	}

	/**
	 * Automatically determines whether to include credentials based on CORS detection
	 */
	public async shouldIncludeCredentials(): Promise<boolean> {
		// If explicitly set, always use that value
		if (this.includeCredentials !== undefined) {
			return this.includeCredentials;
		}

		try {
			const corsResult = await this.detectCors();
			if (corsResult.valid) {
				console.warn(
					`[Autumn] Detected CORS credentials: ${corsResult.includeCredentials}`,
				);
				console.warn(
					`[Autumn] To disable this warning, you can set includeCredentials={${
						corsResult.includeCredentials ? "true" : "false"
					}} in <AutumnProvider />`,
				);
				this.includeCredentials = corsResult.includeCredentials;
				return corsResult.includeCredentials || false;
			}

			console.warn(`[Autumn] CORS detection failed, defaulting to false`);
			return false;
		} catch (error: any) {
			console.error(`[Autumn] Error detecting CORS: ${error.message}`);
			return false;
		}
	}

	async getHeaders() {
		let headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (this.getBearerToken) {
			try {
				const token = await this.getBearerToken();
				headers.Authorization = `Bearer ${token}`;
			} catch (_) {
				console.error(`Failed to call getToken() in AutumnProvider`);
			}
		}

		if (this.headers) {
			headers = { ...headers, ...this.headers };
		}

		return headers;
	}

	async handleFetch<T = Record<string, unknown>>({
		path,
		method,
		body,
	}: {
		path: string;
		method: string;
		body?: any;
	}) {
		body =
			method === "POST"
				? {
						...body,
						[this.camelCase ? "customerData" : "customer_data"]:
							this.customerData || undefined,
					}
				: undefined;

		const includeCredentials = await this.shouldIncludeCredentials();

		try {
			const response = await fetch(`${this.backendUrl}${path}`, {
				method,
				body: body ? JSON.stringify(body) : undefined,
				headers: await this.getHeaders(),
				credentials: includeCredentials ? "include" : "omit",
			});

			const loggedError = await logAuthError(response);

			return await handleFetchResult({
				response,
				logger: console,
				logError: !loggedError,
			});
		} catch (error: unknown) {
			logFetchError({
				method,
				backendUrl: this.backendUrl || "",
				path,
				error,
			});
			throw error;
		}
	}

	async post<T = any>(path: string, body: T | T[]) {
		return await this.handleFetch({
			path,
			method: "POST",
			body,
		});
	}

	async get(path: string) {
		return await this.handleFetch({
			path,
			method: "GET",
		});
	}

	async delete(path: string) {
		return await this.handleFetch({
			path,
			method: "DELETE",
		});
	}

	customers = {
		getOrCreate: async (
			params: CreateCustomerParams,
		): Promise<Customer | null> => {
			return await createCustomerMethod({
				client: this,
				params,
			});
		},
	};

	attach = attachMethod.bind(this);
	checkout = checkoutMethod.bind(this);
	cancel = cancelMethod.bind(this);
	check = checkMethod.bind(this);
	track = trackMethod.bind(this);
	openBillingPortal = openBillingPortalMethod.bind(this);
	setupPayment = setupPaymentMethod.bind(this);
	query = queryMethod.bind(this);

	entities = {
		create: createEntityMethod.bind(this),
		get: getEntityMethod.bind(this),
		delete: deleteEntityMethod.bind(this),
	};

	referrals = {
		createCode: createCode.bind(this),
		redeemCode: redeemCode.bind(this),
	};

	products = {
		list: listProductsMethod.bind(this),
	};
}
