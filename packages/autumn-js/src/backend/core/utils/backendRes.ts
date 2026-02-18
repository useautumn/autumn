import type { BackendErrorBody, BackendResult } from "../types";

export const backendSuccess = <T>({
	body,
	statusCode = 200,
}: {
	body: T | null;
	statusCode?: number;
}): BackendResult<T> => {
	return { statusCode, body };
};

export const backendError = ({
	message,
	code = "internal_server_error",
	statusCode = 500,
	details,
}: {
	message: string;
	code?: string;
	statusCode?: number;
	details?: unknown;
}): BackendResult<BackendErrorBody> => {
	return {
		statusCode,
		body: {
			message: message || "Internal server error",
			code,
			statusCode,
			...(details !== undefined ? { details } : {}),
		},
	};
};

export const isBackendResult = (value: unknown): value is BackendResult => {
	return (
		!!value &&
		typeof value === "object" &&
		"statusCode" in value &&
		"body" in value
	);
};
