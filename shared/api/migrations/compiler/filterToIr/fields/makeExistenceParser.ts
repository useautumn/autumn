import type { IRNode } from "../../ir/irTypes.js";

/**
 * Factory for nullable-existence field parsers. The pattern is identical
 * across `price`, `rollover`, and any future field where the only phase-1
 * questions are "is this column null?" / "is it non-null?":
 *   field: null           → exists(false)
 *   field: { $eq: null }  → exists(false)
 *   field: { $ne: null }  → exists(true)
 *
 * `scopePath` is the dotted public path used in error messages
 * (e.g. "plan.item.rollover"). The IR `field` is the bare name.
 */
export function makeExistenceParser({
	field,
	scopePath,
}: {
	field: string;
	scopePath: string;
}): (raw: unknown) => IRNode {
	return (raw: unknown): IRNode => {
		if (raw === null)
			return { kind: "leaf", field, op: "exists", value: false };

		if (typeof raw !== "object")
			throw new Error(`${scopePath} must be null or an object`);

		const ops = raw as Record<string, unknown>;
		const hasOnlyNullOps =
			Object.keys(ops).every((k) => k === "$eq" || k === "$ne") &&
			Object.values(ops).every((v) => v === null || v === undefined);
		if (!hasOnlyNullOps)
			throw new Error(
				`${scopePath} filtering on nested fields is not supported in phase 1`,
			);

		if ("$ne" in ops && ops.$ne === null)
			return { kind: "leaf", field, op: "exists", value: true };
		if ("$eq" in ops && ops.$eq === null)
			return { kind: "leaf", field, op: "exists", value: false };

		throw new Error(`${scopePath} requires $eq: null or $ne: null`);
	};
}
