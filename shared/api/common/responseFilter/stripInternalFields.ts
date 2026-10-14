import { responseFilterConfig } from "./responseFilterConfig";

export function stripInternalFields({ data }: { data: unknown }): unknown {
	if (data === null || typeof data !== "object") return data;

	if (Array.isArray(data)) {
		return data.map((item) => stripInternalFields({ data: item }));
	}

	const obj = data as Record<string, unknown>;
	const objectType = obj.object;

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
