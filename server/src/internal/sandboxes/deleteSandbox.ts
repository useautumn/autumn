import { ErrCode, type Organization, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const deleteSandboxForOrg = async ({
	db,
	masterOrg,
	sandboxId,
	logger,
}: {
	db: DrizzleCli;
	masterOrg: Organization;
	sandboxId: string;
	logger: Logger;
}): Promise<void> => {
	const target = await OrgService.get({ db, orgId: sandboxId });

	if (
		target.id === masterOrg.id ||
		target.created_by !== masterOrg.id ||
		target.is_sandbox !== true
	) {
		throw new RecaseError({
			message: "Sandbox not found",
			code: ErrCode.OrgNotFound,
			statusCode: 404,
		});
	}

	await deletePlatformSubOrg({ db, org: target, logger });
};
