import type { ApprovalViolation } from "./approvalViolation";

/** Most specific first; a match at an earlier level beats any later one. */
export const APPROVAL_LEVELS = ["user", "role", "everyone"] as const;
export type ApprovalLevel = (typeof APPROVAL_LEVELS)[number];

export type ApprovalDecidedBy = {
	level: ApprovalLevel;
	rule_id: string;
	rule_name: string;
};

export type ApprovalVerdict =
	/** `decided_by: null` means no rule matched, so the coarse scope alone decides. */
	| { verdict: "allow"; decided_by: ApprovalDecidedBy | null }
	| {
			verdict: "deny";
			decided_by: ApprovalDecidedBy;
			/** The deciding block rule's conditions that this request matched. */
			violations: ApprovalViolation[];
			/** Role ids whose own allow rule would win for this exact request. */
			allowed_roles: string[];
			message: string;
	  };
