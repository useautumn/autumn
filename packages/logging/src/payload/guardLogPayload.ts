const defaultMaxPayloadBytes = 512_000;
const defaultTruncateAboveBytes = 4_000;
const defaultMaxArrayItems = 5;
const defaultMaxStringLength = 500;
const defaultMaxDepth = 6;

export type GuardLogPayloadOptions = {
	maxPayloadBytes?: number;
	truncateAboveBytes?: number;
	maxArrayItems?: number;
	maxStringLength?: number;
	maxDepth?: number;
};

const envNumber = ({
	value,
	fallback,
}: {
	value?: string;
	fallback: number;
}) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveOptions = ({
	options = {},
}: {
	options?: GuardLogPayloadOptions;
}) => ({
	maxPayloadBytes:
		options.maxPayloadBytes ??
		envNumber({
			value: process.env.LOG_MAX_PAYLOAD_BYTES,
			fallback: defaultMaxPayloadBytes,
		}),
	truncateAboveBytes:
		options.truncateAboveBytes ??
		envNumber({
			value: process.env.LOG_TRUNCATE_ABOVE_BYTES,
			fallback: defaultTruncateAboveBytes,
		}),
	maxArrayItems:
		options.maxArrayItems ??
		envNumber({
			value: process.env.LOG_MAX_ARRAY_ITEMS,
			fallback: defaultMaxArrayItems,
		}),
	maxStringLength:
		options.maxStringLength ??
		envNumber({
			value: process.env.LOG_MAX_STRING_LENGTH,
			fallback: defaultMaxStringLength,
		}),
	maxDepth: options.maxDepth ?? defaultMaxDepth,
});

type ResolvedGuardOptions = ReturnType<typeof resolveOptions>;

const truncateString = ({
	value,
	maxStringLength,
}: {
	value: string;
	maxStringLength: number;
}): string =>
	value.length > maxStringLength
		? `${value.slice(0, maxStringLength)}...[+${value.length - maxStringLength} chars]`
		: value;

const truncateValue = ({
	value,
	options,
	depth = 0,
}: {
	value: unknown;
	options: ResolvedGuardOptions;
	depth?: number;
}): unknown => {
	if (typeof value === "string")
		return truncateString({
			value,
			maxStringLength: options.maxStringLength,
		});
	if (!value || typeof value !== "object") return value;

	if (depth >= options.maxDepth) {
		if (Array.isArray(value)) return `...[${value.length} items]`;
		return "...[object]";
	}

	if (Array.isArray(value)) {
		const kept = value.slice(0, options.maxArrayItems).map((item) =>
			truncateValue({
				value: item,
				options,
				depth: depth + 1,
			}),
		);
		if (value.length > options.maxArrayItems) {
			kept.push(`...[+${value.length - options.maxArrayItems} more items]`);
		}
		return kept;
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack,
		};
	}

	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		out[key] = truncateValue({
			value: item,
			options,
			depth: depth + 1,
		});
	}
	return out;
};

export const guardLogPayload = ({
	value,
	options: guardOptions,
}: {
	value: unknown;
	options?: GuardLogPayloadOptions;
}): unknown => {
	if (value === undefined) return undefined;
	const options = resolveOptions({ options: guardOptions });
	try {
		const json = JSON.stringify(value);
		if (!json || json.length <= options.truncateAboveBytes) return value;

		const truncated = truncateValue({ value, options });
		const truncatedJson = JSON.stringify(truncated);
		if (truncatedJson && truncatedJson.length > options.maxPayloadBytes) {
			return { _truncated: true, _bytes: truncatedJson.length };
		}
		return truncated;
	} catch {
		return { _unserializable: true };
	}
};
