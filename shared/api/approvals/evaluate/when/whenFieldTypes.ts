import type { ApprovalUserPrincipal } from "../types/approvalPrincipal";
import type {
	ApprovalViolation,
	ViolationValue,
} from "../types/approvalVerdict";

/** Threaded through every matcher so book-of-business (`$actor`) can resolve later. */
export type WhenMatchContext = {
	principal: ApprovalUserPrincipal;
	now: Date;
};

/**
 * How one `when` field is matched and explained. Filters are typed `unknown`
 * here; rules are validated against the area's schema on save, so each field
 * builder reads its filter as that field's matcher type.
 */
export type WhenField<Parent> = {
	label: string;
	/** The violation for this field, or null when the filter matches. */
	check: (args: {
		filter: unknown;
		parent: Parent;
		path: string;
		context: WhenMatchContext;
	}) => ApprovalViolation | null;
	describeLimit: (args: { filter: unknown }) => ViolationValue;
	describeActual: (args: {
		filter: unknown;
		parent: Parent;
		context: WhenMatchContext;
	}) => ViolationValue;
	/** The limit when an `$or` group only tests this field. Defaults to each branch joined with "or". */
	describeLimits?: (args: { filters: unknown[] }) => ViolationValue;
};

export type WhenFields<Parent> = Record<string, WhenField<Parent>>;

export type WhenFilter = Record<string, unknown>;
