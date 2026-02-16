import type Autumn from "@sdk";
import { logger } from "../../../utils/logger";
import type { CustomerData } from "../../types/customerData";
import type { AuthResult, CustomerId } from "./AuthFunction";
import {
	backendError,
	backendSuccess,
	type BackendResult,
	isBackendResult,
} from "./backendRes";

// 1. Takes in
export const withAuth = <T extends {}>({
	fn,
	requireCustomer = true,
}: {
	fn: (args: {
		autumn: Autumn;
		body: any;
		customerId: CustomerId;
		customerData?: CustomerData;
		pathParams?: Record<string, string>;
		searchParams?: Record<string, string>;
	}) => Promise<any>;
	requireCustomer?: boolean;
}) => {
	const toBackendFailure = (error: unknown) => {
		if (error && typeof error === "object") {
			const maybeError = error as {
				message?: string;
				name?: string;
				code?: string;
				statusCode?: number;
				body?: string;
				cause?: unknown;
			};

			if (typeof maybeError.statusCode === "number") {
				let parsedBody: { message?: string; code?: string; details?: unknown } =
					{};
				if (typeof maybeError.body === "string" && maybeError.body.length > 0) {
					try {
						parsedBody = JSON.parse(maybeError.body);
					} catch {
						parsedBody = {};
					}
				}

				return backendError({
					statusCode: maybeError.statusCode,
					message:
						parsedBody.message ||
						maybeError.message ||
						"Autumn API request failed",
					code: parsedBody.code || maybeError.code || "autumn_api_error",
					details:
						parsedBody.details !== undefined
							? parsedBody.details
							: {
									name: maybeError.name,
									cause: maybeError.cause,
								},
				});
			}

			return backendError({
				message: maybeError.message || "Internal server error",
				code: maybeError.code || "internal_error",
				details: {
					name: maybeError.name,
					cause: maybeError.cause,
				},
			});
		}

		return backendError({
			message: "Internal server error",
			code: "internal_error",
		});
	};

	return async ({
		autumn,
		body,
		path,
		getCustomer,
		pathParams,
		searchParams,
	}: {
		autumn: Autumn;
		body: any;
		path: string;
		getCustomer: () => AuthResult;
		pathParams?: Record<string, string>;
		searchParams?: Record<string, string>;
	}): Promise<BackendResult> => {
		let authResult: Awaited<AuthResult>;
		try {
			authResult = await getCustomer();
		} catch (error: unknown) {
			logger.error(`[Autumn]: identify failed`, error);
			return toBackendFailure(error);
		}

		const customerId = authResult?.customerId;

		if (!customerId && requireCustomer) {
			const isCreateCustomerPath = path === "/api/autumn/customers";
			if (isCreateCustomerPath && body?.errorOnNotFound === false) {
				return backendSuccess({ statusCode: 204, body: null });
			}

			logger.error(
				`[Autumn]: customerId returned from identify function is ${customerId}`,
			);

			return backendError({
				message: `customerId returned from identify function is ${customerId}`,
				code: "no_customer_id",
				statusCode: 401,
			});
		}

		const customerData = authResult?.customerData || body?.customerData;

		try {
			const result = await fn({
				body,
				autumn,
				customerId: customerId as CustomerId,
				customerData,
				pathParams,
				searchParams,
			});

			if (isBackendResult(result)) {
				return result;
			}

			return backendSuccess({ body: result });
		} catch (error: any) {
			logger.error(`${error.message}`);
			return toBackendFailure(error);
		}
	};
};
