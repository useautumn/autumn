import { responseFilterConfig } from "./responseFilterConfig";

/**
 * Recursively strips internal fields from response data based on object type.
 * Uses the `object` field to identify which filter rules to apply.
 */
export function stripInternalFields({ data }: { data: unknown }): unknown {
	if (data === null || typeof data !== "object") return data;

	if (Array.isArray(data)) {
		return data.map((item) => stripInternalFields({ data: item }));
	}

	const obj = data as Record<string, unknown>;
	const objectType = obj.object;

	// Get fields to omit for this object type
	const fieldsToOmit =
		typeof objectType === "string"
			? (responseFilterConfig[objectType] ?? [])
			: [];

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (fieldsToOmit.includes(key)) continue;
		result[key] = stripInternalFields({ data: value });
	}

	return result;
}
