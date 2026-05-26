import type { Logger } from "@/external/logtail/logtailUtils.js";

type LogCaughtErrorLevel = "error" | "warn";

export const caughtErrorToLogFields = (error: unknown) => {
	if (error instanceof Error) {
		return {
			errorName: error.name,
			errorMessage: error.message,
			errorStack: error.stack,
			errorString: String(error),
		};
	}

	return {
		errorName: typeof error,
		errorMessage: String(error),
		errorStack: undefined,
		errorString: String(error),
	};
};

export const logCaughtError = ({
	logger,
	message,
	error,
	data,
	level = "error",
}: {
	logger?: Logger;
	message: string;
	error: unknown;
	data?: Record<string, unknown>;
	level?: LogCaughtErrorLevel;
}) => {
	const logFields = caughtErrorToLogFields(error);
	const consoleMethod = level === "warn" ? console.warn : console.error;

	consoleMethod(message, error);
	logger?.[level](message, {
		...logFields,
		...(data ? { data } : {}),
	});
};
