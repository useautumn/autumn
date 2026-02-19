import { AutumnError } from "@useautumn/sdk";
import type { BackendResult } from "../types";
import { backendError } from "../utils/backendRes";

type ParsedErrorBody = {
	message?: string;
	code?: string;
	env?: string;
};

/** Parse JSON body from SDK error */
const parseErrorBody = (body: string): ParsedErrorBody => {
	if (!body || body.length === 0) return {};
	try {
		return JSON.parse(body) as ParsedErrorBody;
	} catch {
		return {};
	}
};

/** Transform any error into a BackendResult */
export const transformSdkError = (error: unknown): BackendResult => {
	// Handle Autumn SDK errors
	if (error instanceof AutumnError) {
		const parsed = parseErrorBody(error.body);

		return backendError({
			statusCode: error.statusCode,
			message: parsed.message ?? error.message ?? "Autumn API request failed",
			code: parsed.code ?? "autumn_api_error",
		});
	}

	// Handle standard Error objects
	if (error instanceof Error) {
		return backendError({
			message: error.message,
			code: "internal_error",
		});
	}

	// Handle unknown errors
	return backendError({
		message: "Internal server error",
		code: "internal_error",
	});
};
