/** biome-ignore-all lint/suspicious/noExplicitAny: RPC test client needs flexible payload typing */
import dotenv from "dotenv";

dotenv.config();

import { ErrCode, type OrgConfig } from "@autumn/shared";
import AutumnError from "./autumnCli.js";

export class AutumnRpcCli {
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

	private resolvePath(path: string) {
		return path.startsWith("/") ? path : `/${path}`;
	}

	async post(path: string, body: any) {
		const response = await fetch(`${this.baseUrl}${this.resolvePath(path)}`, {
			method: "POST",
			headers: this.headers,
			body: JSON.stringify(body),
		});

		if (response.status !== 200) {
			// Handle rate limit errors
			if (response.status === 429) {
				throw new AutumnError({
					message: "request failed, rate limit exceeded",
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

	rpc = {
		call: async <T = any>({
			method,
			body,
		}: {
			method: string;
			body: any;
		}): Promise<T> => {
			return (await this.post(method, body)) as T;
		},
	};

	plans = {
		create: async <TResponse = any, TInput = any>(
			plan: TInput,
		): Promise<TResponse> => {
			return await this.post("/plans.create", plan);
		},

		createVariant: async <TResponse = any>(params: {
			plan_id: string;
			variant_id: string;
			variant_name: string;
		}): Promise<TResponse> => {
			return await this.post("/plans.createVariant", params);
		},

		deleteVariant: async (
			planId: string,
			variantId: string,
		): Promise<{ success: boolean }> => {
			return await this.post("/plans.deleteVariant", {
				plan_id: planId,
				variant_id: variantId,
			});
		},

		get: async <TResponse = any>(
			planId: string,
			{ variantId }: { variantId?: string } = {},
		): Promise<TResponse> => {
			return await this.post("/plans.get", {
				plan_id: planId,
				...(variantId ? { variant_id: variantId } : {}),
			});
		},

		update: async <TResponse = any, TInput = any>(
			planId: string,
			updates: TInput,
			{ variantId }: { variantId?: string } = {},
		): Promise<TResponse> => {
			return await this.post("/plans.update", {
				...(updates as Record<string, unknown>),
				plan_id: planId,
				...(variantId ? { variant_id: variantId } : {}),
			});
		},

		delete: async (
			planId: string,
			{ allVersions = false }: { allVersions?: boolean } = {},
		): Promise<{ success: boolean }> => {
			return await this.post("/plans.delete", {
				plan_id: planId,
				all_versions: allVersions,
			});
		},
	};
}

export default AutumnRpcCli;
