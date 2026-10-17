import type { ApprovalPrincipal } from "../types/approvalPrincipal";
import type {
	ApprovalViolation,
	ViolationValue,
} from "../types/approvalViolation";

/** Threaded through every field so book-of-business (`$actor`) can resolve later; unused in v1. */
export type FilterMatchContext = { principal: ApprovalPrincipal; now: Date };

/**
 * `match` carries the conditions that held. `unsupported` is a key or group the
 * evaluator can't judge; the caller resolves it by the rule's effect.
 */
export type FilterMatch =
	| { result: "match"; conditions: ApprovalViolation[] }
	| { result: "no_match" }
	| { result: "unsupported"; conditions: ApprovalViolation[] };

/**
 * How one filter field is matched and explained. Filters are typed `unknown`:
 * rules are validated against the area's schema on save, so each field builder
 * reads its filter as that field's matcher type.
 */
export type FilterField<Parent> = {
	/** The field's UI label, for a condition it can't check. */
	label?: string;
	match: (args: {
		filter: unknown;
		parent: Parent;
		path: string;
		context: FilterMatchContext;
	}) => FilterMatch;
	/** The filter as one short phrase, e.g. "< 2 months" or "enterprise". */
	describeCondition: (args: { filter: unknown }) => ViolationValue;
	/** Nested fields (array elements, nullable objects), so the registry can be walked. */
	fields?: FilterFields<never>;
};

export type FilterFields<Parent> = Record<string, FilterField<Parent>>;
