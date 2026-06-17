export const isErrorResult = (result: unknown): boolean =>
	typeof result === "object" &&
	result !== null &&
	("error" in result ||
		(result as { isError?: unknown }).isError === true ||
		(result as { id?: unknown }).id === "TOOL_EXECUTION_FAILED" ||
		(typeof (result as { code?: unknown }).code === "string" &&
			typeof (result as { message?: unknown }).message === "string"));

const MAX_ERROR_MESSAGE_LENGTH = 700;

const cleanMessage = (message: string) =>
	message
		.replace(/^Error:\s*/, "")
		.replace(/\s+/g, " ")
		.trim();

const truncateMessage = (message: string) =>
	message.length > MAX_ERROR_MESSAGE_LENGTH
		? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
		: message;

const parseAutumnApiErrorMessage = (message: string) => {
	const match = message.match(/Autumn API request failed \(\d+\):\s*(.+)$/s);
	if (!match) return null;

	try {
		const parsed = JSON.parse(match[1] ?? "");
		return typeof parsed?.message === "string" ? parsed.message : null;
	} catch {
		return null;
	}
};

const getMcpContentText = (value: Record<string, unknown>): string | null => {
	if (!Array.isArray(value.content)) return null;
	const item = value.content.find((entry): entry is { text: string } =>
		Boolean(
			entry &&
				typeof entry === "object" &&
				"text" in entry &&
				typeof entry.text === "string",
		),
	);
	return item?.text ?? null;
};

const getObjectMessage = (value: Record<string, unknown>): string | null => {
	if (typeof value.message === "string") return value.message;
	if (typeof value.error === "string") return value.error;
	if (
		value.error &&
		typeof value.error === "object" &&
		typeof (value.error as { message?: unknown }).message === "string"
	) {
		return (value.error as { message: string }).message;
	}
	if (
		value.details &&
		typeof value.details === "object" &&
		typeof (value.details as { errorMessage?: unknown }).errorMessage ===
			"string"
	) {
		return (value.details as { errorMessage: string }).errorMessage;
	}
	const contentText = getMcpContentText(value);
	if (!contentText) return null;
	try {
		const parsed = JSON.parse(contentText);
		if (parsed && typeof parsed === "object") {
			return getObjectMessage(parsed as Record<string, unknown>) ?? contentText;
		}
	} catch {
		return contentText;
	}
	return null;
};

export const approvalErrorResult = (error: unknown) => {
	const rawMessage =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: error && typeof error === "object"
					? (getObjectMessage(error as Record<string, unknown>) ??
						"The action failed.")
					: "The action failed.";
	const cleanedRawMessage = cleanMessage(rawMessage);
	const message = cleanMessage(
		parseAutumnApiErrorMessage(cleanedRawMessage) ?? cleanedRawMessage,
	);

	return {
		error: true as const,
		message: truncateMessage(message || "The action failed."),
	};
};
