import { createHash } from "node:crypto";

const stableStringify = ({ value }: { value: unknown }): string => {
	if (!value || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map((item) => stableStringify({ value: item })).join(",")}]`;

	return `{${Object.entries(value)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(
			([key, item]) =>
				`${JSON.stringify(key)}:${stableStringify({ value: item })}`,
		)
		.join(",")}}`;
};

export const createSessionId = ({ parts }: { parts: unknown }): string =>
	createHash("sha256")
		.update(stableStringify({ value: parts }))
		.digest("hex")
		.slice(0, 24);
