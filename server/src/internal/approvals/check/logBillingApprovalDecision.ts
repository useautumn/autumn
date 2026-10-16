import { tryCatch } from "@autumn/shared";
import { billingFactsToJson } from "@/internal/approvals/facts/billing/billingFactsToJson";
import { logApprovalDecision } from "./logApprovalDecision";
import type {
	BillingApprovalFacts,
	BillingApprovalOutcome,
} from "./types/billingApprovalOutcome";
import type { CheckBillingApprovalParams } from "./types/checkBillingApprovalParams";

/**
 * Logs a write's verdict. A preview isn't logged unless it stands in for a write
 * and its enforced deny stops the request there, since no write follows to log it.
 */
export const logBillingApprovalDecision = async ({
	params: { ctx, preview, gatesWrite },
	outcome: { action, principal, rules, verdict, enforced },
	facts,
}: {
	params: CheckBillingApprovalParams;
	outcome: BillingApprovalOutcome;
	facts: () => Promise<BillingApprovalFacts>;
}) => {
	if (!principal || !rules || !verdict) return;
	const stopsAtGate = gatesWrite && enforced && verdict.verdict === "deny";
	if (preview && !stopsAtGate) return;

	// Shadow mode: a failed log must never fail the customer's write.
	const { error } = await tryCatch(
		facts().then((all) =>
			logApprovalDecision({
				ctx,
				action,
				principal,
				rules,
				verdict,
				enforced,
				facts: billingFactsToJson({ facts: all }),
			}),
		),
	);
	if (error) ctx.logger.error("Failed to log approval decision", { error });
};
