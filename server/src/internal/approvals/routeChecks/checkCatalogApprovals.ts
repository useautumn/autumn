import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkRouteApproval } from "@/internal/approvals/check/checkRouteApproval";
import type { CatalogApprovalCheck } from "@/internal/approvals/facts/catalog/catalogApprovalCheck";

const checkKey = (check: CatalogApprovalCheck) =>
	"planId" in check
		? `${check.action}:${check.planId}`
		: `${check.action}:${check.featureId}`;

/** Every plan and feature a request writes, each judged once on its own id; the first deny stops the request. */
export const checkCatalogApprovals = async ({
	ctx,
	checks,
}: {
	ctx: AutumnContext;
	checks: CatalogApprovalCheck[];
}) => {
	const distinctChecks = [
		...new Map(checks.map((check) => [checkKey(check), check])).values(),
	];
	for (const check of distinctChecks) {
		if ("planId" in check) {
			await checkRouteApproval({
				ctx,
				action: check.action,
				buildFacts: async () => ({ plan_id: check.planId }),
			});
			continue;
		}
		await checkRouteApproval({
			ctx,
			action: check.action,
			buildFacts: async () => ({ feature_id: check.featureId }),
		});
	}
};
