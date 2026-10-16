import { PermissionDeniedError } from "@autumn/shared";
import type { BillingApprovalOutcome } from "./types/billingApprovalOutcome";
import type { CheckBillingApprovalParams } from "./types/checkBillingApprovalParams";

/** Under enforcement a denied write stops; in shadow mode it's only logged, and a preview only shows it. */
export const throwIfEnforcedDeny = ({
	params: { preview, gatesWrite },
	outcome: { verdict, enforced },
}: {
	params: CheckBillingApprovalParams;
	outcome: BillingApprovalOutcome;
}) => {
	const stopsWrite = !preview || gatesWrite;
	if (!stopsWrite || !enforced || verdict?.verdict !== "deny") return;
	throw new PermissionDeniedError({ verdict });
};
