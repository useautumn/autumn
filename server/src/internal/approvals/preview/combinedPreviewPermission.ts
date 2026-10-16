import type { PreviewPermission } from "@autumn/shared";
import type { ApprovalVerdict } from "@autumn/shared/api/approvals/evaluate/index.js";

/** One verdict for a request made of several changes: any deny decides; omitted when no rule applied. */
export const combinedPreviewPermission = ({
	verdicts,
}: {
	verdicts: (ApprovalVerdict | undefined)[];
}): PreviewPermission | undefined => {
	const decided = verdicts.filter(
		(verdict): verdict is PreviewPermission =>
			verdict !== undefined && verdict.verdict !== "fallback",
	);
	return decided.find(({ verdict }) => verdict === "deny") ?? decided[0];
};
