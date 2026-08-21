import type { ChatApproval } from "@autumn/shared";

export type ApprovalDecidability =
	| { decidable: true }
	| { decidable: false; reason: "expired" | `already ${string}` };

/** Every surface must refuse decided or expired cards the same way; the Slack
 * claim enforces this in SQL, other surfaces call this before acting. */
export const assertDecidableApproval = ({
	approval,
	now = Date.now(),
}: {
	approval: ChatApproval;
	now?: number;
}): ApprovalDecidability => {
	if (approval.status !== "pending") {
		return { decidable: false, reason: `already ${approval.status}` };
	}
	if ((approval.expires_at ?? 0) <= now) {
		return { decidable: false, reason: "expired" };
	}
	return { decidable: true };
};
