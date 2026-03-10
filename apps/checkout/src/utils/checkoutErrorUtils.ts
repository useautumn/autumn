import { CheckoutErrorCode } from "@autumn/shared";

const FALLBACK_MESSAGE = "Failed to load checkout";

const getORPCErrorBody = ({ error }: { error: unknown }) => {
	if (
		error &&
		typeof error === "object" &&
		"data" in error &&
		error.data &&
		typeof error.data === "object" &&
		"body" in error.data &&
		error.data.body &&
		typeof error.data.body === "object"
	) {
		return error.data.body;
	}

	return undefined;
};

const getErrorCode = ({ error }: { error: unknown }) => {
	if (!error || typeof error !== "object") {
		return undefined;
	}

	const orpcBody = getORPCErrorBody({ error });

	if (
		orpcBody &&
		"code" in orpcBody &&
		typeof orpcBody.code === "string"
	) {
		return orpcBody.code;
	}

	if ("code" in error && typeof error.code === "string") {
		return error.code;
	}

	if (
		"data" in error &&
		error.data &&
		typeof error.data === "object" &&
		"code" in error.data &&
		typeof error.data.code === "string"
	) {
		return error.data.code;
	}

	if (
		"response" in error &&
		error.response &&
		typeof error.response === "object" &&
		"data" in error.response &&
		error.response.data &&
		typeof error.response.data === "object" &&
		"code" in error.response.data &&
		typeof error.response.data.code === "string"
	) {
		return error.response.data.code;
	}

	return undefined;
};

const getErrorMessage = ({ error }: { error: unknown }) => {
	if (!error || typeof error !== "object") {
		return FALLBACK_MESSAGE;
	}

	const orpcBody = getORPCErrorBody({ error });

	if (
		orpcBody &&
		"message" in orpcBody &&
		typeof orpcBody.message === "string"
	) {
		return orpcBody.message;
	}

	if (
		"data" in error &&
		error.data &&
		typeof error.data === "object" &&
		"message" in error.data &&
		typeof error.data.message === "string"
	) {
		return error.data.message;
	}

	if (
		"response" in error &&
		error.response &&
		typeof error.response === "object" &&
		"data" in error.response &&
		error.response.data &&
		typeof error.response.data === "object" &&
		"message" in error.response.data &&
		typeof error.response.data.message === "string"
	) {
		return error.response.data.message;
	}

	if ("message" in error && typeof error.message === "string") {
		return error.message;
	}

	return FALLBACK_MESSAGE;
};

export const checkoutErrorToDisplay = ({ error }: { error: unknown }) => {
	const code = getErrorCode({ error });

	switch (code) {
		case CheckoutErrorCode.CheckoutCompleted:
			return {
				variant: "completed" as const,
				title: "Checkout complete",
				message: "This checkout link has already been used.",
			};
		case CheckoutErrorCode.CheckoutExpired:
			return {
				variant: "expired" as const,
				title: "Checkout expired",
				message: "This checkout link has expired. Create a new checkout to continue.",
			};
		case CheckoutErrorCode.CheckoutUnavailable:
			return {
				variant: "unavailable" as const,
				title: "Checkout unavailable",
				message: "This checkout link is invalid or no longer available.",
			};
		default:
			return {
				variant: "generic" as const,
				title: "Something went wrong",
				message: getErrorMessage({ error }),
			};
	}
};
