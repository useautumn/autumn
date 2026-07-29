import { AuthType, CopyProductParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { SANDBOX_ORG_HEADER } from "@/honoMiddlewares/sandboxAccess.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { copyProductForOrgs } from "./copyProductForOrgs.js";

/**
 * Route: POST /v1/products/:productId/copy - Copy a product
 *
 * Same-org env-copy by default. From a named sandbox (a dashboard session acting
 * via `x-sandbox-org-id`), it promotes into the MASTER org's env instead — so
 * "Copy to Production" reaches real production rather than the sub-org's own
 * unviewable Live env. A sandbox API key (non-dashboard) keeps same-org copy.
 */
export const handleCopyProductV2 = createRoute({
	scopes: [Scopes.Plans.Write],
	body: CopyProductParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { db, logger, org, env: fromEnv, authType } = ctx;
		const { product_id: fromProductId } = c.req.param();
		const { env: toEnv, id: toId, name: toName } = body;

		const promoting =
			authType === AuthType.Dashboard &&
			org.is_sandbox === true &&
			!!c.req.header(SANDBOX_ORG_HEADER) &&
			!!org.created_by;

		const toOrg = promoting
			? await OrgService.get({ db, orgId: org.created_by as string })
			: org;

		await copyProductForOrgs({
			db,
			logger,
			fromOrg: org,
			fromEnv,
			toOrg,
			toEnv,
			fromProductId,
			toId,
			toName,
		});

		return c.json({ message: "Product copied" });
	},
});
