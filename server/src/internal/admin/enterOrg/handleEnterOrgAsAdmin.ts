import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { auth } from "@/utils/auth.js";
import { enterOrgAsAdmin } from "./enterOrgAsAdmin.js";

/** POST /admin/orgs/:org_id/enter — switches the calling admin's own session into the org. */
export const handleEnterOrgAsAdmin = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({
		org_id: z.string().min(1),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org_id: orgId } = c.req.valid("param");
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		// An impersonation session belongs to the customer, so only a staff member's own session may move
		const isStaffSession =
			session?.user?.role === "admin" && !session.session.impersonatedBy;
		if (!session || !isStaffSession) {
			throw new RecaseError({
				message: "Stop impersonating before entering an org",
				code: ErrCode.InvalidRequest,
				statusCode: 403,
			});
		}

		const org = await enterOrgAsAdmin({
			ctx,
			orgId,
			sessionId: session.session.id,
		});

		return c.json({ org_id: org.id, deployed: org.deployed });
	},
});
