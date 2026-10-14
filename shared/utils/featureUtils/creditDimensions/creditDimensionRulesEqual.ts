import { deterministicStringify } from "../../common/deterministicStringify.js";

export const creditDimensionRulesEqual = ({
	left,
	right,
}: {
	left: { dimensions?: unknown; multipliers?: unknown };
	right: { dimensions?: unknown; multipliers?: unknown };
}): boolean =>
	deterministicStringify(left.dimensions ?? {}) ===
		deterministicStringify(right.dimensions ?? {}) &&
	deterministicStringify(left.multipliers ?? {}) ===
		deterministicStringify(right.multipliers ?? {});
