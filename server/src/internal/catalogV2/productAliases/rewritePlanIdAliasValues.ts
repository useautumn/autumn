import { PLAN_ID_ALIAS_REWRITE_KEYS } from "./planIdAliasRewriteKeys.js";

const canonicalValue = ({
	value,
	aliases,
}: {
	value: string;
	aliases: Record<string, string>;
}): string => aliases[value] ?? value;

/**
 * Mutates `value` in place: every known plan-id key becomes its canonical id.
 * `new_plan_id` is intentionally not a rewrite key (rename target).
 */
export const rewritePlanIdAliasValues = ({
	value,
	aliases,
	skipKeys,
}: {
	value: unknown;
	aliases: Record<string, string>;
	skipKeys?: Set<string>;
}): unknown => {
	if (value == null || typeof value !== "object") return value;

	if (Array.isArray(value)) {
		for (const item of value) {
			rewritePlanIdAliasValues({ value: item, aliases, skipKeys });
		}
		return value;
	}

	const record = value as Record<string, unknown>;
	for (const [key, nested] of Object.entries(record)) {
		if (skipKeys?.has(key)) continue;

		if (PLAN_ID_ALIAS_REWRITE_KEYS.has(key)) {
			if (typeof nested === "string") {
				record[key] = canonicalValue({ value: nested, aliases });
				continue;
			}
			if (Array.isArray(nested)) {
				record[key] = nested.map((item) =>
					typeof item === "string"
						? canonicalValue({ value: item, aliases })
						: item,
				);
				for (const item of record[key] as unknown[]) {
					rewritePlanIdAliasValues({ value: item, aliases, skipKeys });
				}
				continue;
			}
		}

		rewritePlanIdAliasValues({ value: nested, aliases, skipKeys });
	}

	return value;
};
