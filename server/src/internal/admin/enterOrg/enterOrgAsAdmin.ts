import { ErrCode, RecaseError } from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { hasOrgMembers } from "./repos/hasOrgMembers.js";
import { setSessionActiveOrg } from "./repos/setSessionActiveOrg.js";

/**
 * Points a staff session at an org that has no members (e.g. an unclaimed keyless
 * sandbox). Orgs with members go through impersonation, which keeps the customer's view.
 */
export const enterOrgAsAdmin = async ({
	ctx,
	orgId,
	sessionId,
}: {
	ctx: RequestContext;
	orgId: string;
	sessionId: string;
}) => {
	const org = await OrgService.get({ db: ctx.db, orgId });

	if (await hasOrgMembers({ db: ctx.db, orgId })) {
		throw new RecaseError({
			message: "This org has members, so impersonate one of them instead",
			code: ErrCode.InvalidRequest,
			statusCode: 409,
		});
	}

	const updated = await setSessionActiveOrg({ db: ctx.db, sessionId, orgId });
	if (!updated) {
		throw new RecaseError({
			message: "Session not found",
			code: ErrCode.InvalidRequest,
			statusCode: 404,
		});
	}

	ctx.logger.info(`Admin ${ctx.userId} entered member-less org ${orgId}`, {
		adminUserId: ctx.userId,
		orgId,
	});

	return org;
};
