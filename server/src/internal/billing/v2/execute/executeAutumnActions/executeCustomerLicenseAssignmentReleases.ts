import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo";

export const executeCustomerLicenseAssignmentReleases = async ({
	ctx,
	release,
}: {
	ctx: AutumnContext;
	release: AutumnBillingPlan["releaseCustomerLicenseAssignments"];
}) => {
	if (!release) return;
	await licenseAssignmentRepo.releaseActiveAssignmentsByLinkIds({
		db: ctx.db,
		...release,
	});
};
