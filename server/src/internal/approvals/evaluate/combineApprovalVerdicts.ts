import type { ApprovalVerdict } from "@autumn/shared/api/approvals/evaluate/index.js";

/** One verdict for a request made of several items: any deny decides, then the first rule-decided allow. */
export const combineApprovalVerdicts = ({
	verdicts,
}: {
	verdicts: ApprovalVerdict[];
}): ApprovalVerdict => {
	const deny = verdicts.find(({ verdict }) => verdict === "deny");
	if (deny) return deny;
	return (
		verdicts.find(({ decided_by }) => decided_by !== null) ?? {
			verdict: "allow",
			decided_by: null,
		}
	);
};
