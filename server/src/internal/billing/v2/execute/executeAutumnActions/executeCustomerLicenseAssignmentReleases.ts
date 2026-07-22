import type { CustomerLicenseAssignmentRelease } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo";

export const executeCustomerLicenseAssignmentReleases = async ({
	ctx,
	release,
}: {
	ctx: AutumnContext;
	release?: CustomerLicenseAssignmentRelease;
}) => {
	if (!release) return;
	await licenseAssignmentRepo.releaseActiveAssignments({
		db: ctx.db,
		...release,
	});
};
