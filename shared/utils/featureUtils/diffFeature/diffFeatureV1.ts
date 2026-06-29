import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";

type JsonObject = Record<string, unknown>;

const sortObject = (value: JsonObject): JsonObject =>
	Object.fromEntries(
		Object.entries(value)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, normalizeValue(entry)]),
	);

const normalizeValue = (value: unknown): unknown => {
	if (value == null) return null;
	if (Array.isArray(value)) {
		const normalized = value.map(normalizeValue);
		return normalized.every((entry) => typeof entry === "string")
			? normalized.sort()
			: normalized;
	}
	if (typeof value === "object") {
		const normalized = sortObject(value as JsonObject);
		return Object.keys(normalized).length > 0 ? normalized : null;
	}
	return value;
};

const normalizeFeatureValue = ({
	key,
	value,
}: {
	key: keyof ApiFeatureV1;
	value: unknown;
}) => {
	if (key === "display" && value && typeof value === "object") {
		const display = value as JsonObject;
		const normalized = Object.fromEntries(
			Object.entries(display).filter(([, entry]) => entry != null),
		);
		return Object.keys(normalized).length > 0 ? sortObject(normalized) : null;
	}

	if (key === "credit_schema" && Array.isArray(value)) {
		return value
			.map(normalizeValue)
			.sort((left, right) =>
				JSON.stringify(left).localeCompare(JSON.stringify(right)),
			);
	}

	return normalizeValue(value);
};

const valuesEqual = ({
	key,
	left,
	right,
}: {
	key: keyof ApiFeatureV1;
	left: unknown;
	right: unknown;
}) =>
	JSON.stringify(normalizeFeatureValue({ key, value: left })) ===
	JSON.stringify(normalizeFeatureValue({ key, value: right }));

export const diffFeatureV1 = ({
	from,
	to,
}: {
	from: ApiFeatureV1;
	to: ApiFeatureV1;
}): { previous_attributes: Record<string, unknown> | null } => {
	const previous: Record<string, unknown> = {};

	for (const key of Object.keys(to) as (keyof ApiFeatureV1)[]) {
		if (!valuesEqual({ key, left: from[key], right: to[key] })) {
			previous[key] = from[key];
		}
	}

	return {
		previous_attributes: Object.keys(previous).length > 0 ? previous : null,
	};
};
