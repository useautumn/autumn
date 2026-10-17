import {
	type ApprovalAction,
	PermissionDeniedError,
	tryCatch,
} from "@autumn/shared";
import type { ApprovalFactsFor } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateApproval } from "@/internal/approvals/evaluate/evaluateApproval";
import { approvalFactsToJson } from "./approvalFactsToJson";
import { logApprovalDecision } from "./logApprovalDecision";

/**
 * The approval check for a write outside billing, after validation and before
 * anything changes: logs a decided verdict, and under enforcement stops a deny.
 */
export const checkRouteApproval = async <Action extends ApprovalAction>({
	ctx,
	action,
	buildFacts,
}: {
	ctx: AutumnContext;
	action: Action;
	/** Only called when a rule could apply. */
	buildFacts: () => Promise<ApprovalFactsFor<Action>>;
}) => {
	if (ctx.skipApproval) return;
	const evaluation = await evaluateApproval({ ctx, action, buildFacts });
	if (!evaluation) return;

	const [verdict] = evaluation.verdicts;
	const enforced = ctx.org.config.approvals_enforced;
	// A failed log must never fail the write.
	const { error } = await tryCatch(
		logApprovalDecision({
			ctx,
			action,
			principal: evaluation.principal,
			rules: evaluation.rules,
			verdict,
			enforced,
			facts: approvalFactsToJson({ facts: evaluation.facts }),
		}),
	);
	if (error) ctx.logger.error("Failed to log approval decision", { error });

	if (enforced && verdict.verdict === "deny")
		throw new PermissionDeniedError({ verdict });
};
