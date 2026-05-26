import type { IRLeaf, IRNode, LeafOp } from "../../ir/irTypes.js";
import type { ResolutionContext } from "../resolutionContext.js";
import { translateValue } from "./translateValue.js";

/**
 * Parse a single field's matcher value into one IR leaf or a small AND of
 * leaves. Handles the supported operators: eq, ne, in, nin, exists, gt,
 * gte, lt, lte.
 *
 * Spelling normalization:
 * - bare value         → eq
 * - { $eq: x }         → eq
 * - { $ne: null }      → exists (true)
 * - { $eq: null }      → eq null
 * - { $in: [...] }     → in
 * - { $gt: n }         → gt   (and same for $gte / $lt / $lte)
 *
 * Multiple operators on one field are combined with AND.
 */
export function parseLeaf({
	field,
	rawValue,
	ctx,
}: {
	field: string;
	rawValue: unknown;
	ctx: ResolutionContext;
}): IRNode {
	if (isBareValue(rawValue)) return makeLeaf(field, "eq", rawValue, ctx);

	const ops = rawValue as Record<string, unknown>;
	const leaves: IRLeaf[] = [];

	if ("$eq" in ops) leaves.push(makeLeaf(field, "eq", ops.$eq, ctx) as IRLeaf);
	if ("$ne" in ops) {
		// $ne: null is the existence-check shorthand for nullable fields.
		if (ops.$ne === null)
			leaves.push(makeLeaf(field, "exists", true, ctx) as IRLeaf);
		else leaves.push(makeLeaf(field, "ne", ops.$ne, ctx) as IRLeaf);
	}
	if ("$in" in ops) leaves.push(makeLeaf(field, "in", ops.$in, ctx) as IRLeaf);
	if ("$nin" in ops)
		leaves.push(makeLeaf(field, "nin", ops.$nin, ctx) as IRLeaf);
	if ("$gt" in ops) leaves.push(makeLeaf(field, "gt", ops.$gt, ctx) as IRLeaf);
	if ("$gte" in ops)
		leaves.push(makeLeaf(field, "gte", ops.$gte, ctx) as IRLeaf);
	if ("$lt" in ops) leaves.push(makeLeaf(field, "lt", ops.$lt, ctx) as IRLeaf);
	if ("$lte" in ops)
		leaves.push(makeLeaf(field, "lte", ops.$lte, ctx) as IRLeaf);

	if (leaves.length === 0)
		throw new Error(`No supported operator found on field "${field}"`);
	if (leaves.length === 1) return leaves[0];
	return { kind: "and", children: leaves };
}

function isBareValue(v: unknown): boolean {
	if (v === null) return true;
	const t = typeof v;
	return t === "string" || t === "number" || t === "boolean";
}

function makeLeaf(
	field: string,
	op: LeafOp,
	value: unknown,
	ctx: ResolutionContext,
): IRLeaf {
	return {
		kind: "leaf",
		field,
		op,
		value: translateValue({ field, value, ctx }) as IRLeaf["value"],
	};
}
