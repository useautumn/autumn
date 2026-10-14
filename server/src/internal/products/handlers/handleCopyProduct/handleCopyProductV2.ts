import { AuthType, CopyProductParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { SANDBOX_ORG_HEADER } from "@/honoMiddlewares/sandboxAccess.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { copyProductForOrgs } from "./copyProductForOrgs.js";
import { isSameEnvVariantCopy } from "./isSameEnvVariantCopy.js";

export const handleCopyProductV2 = createRoute({
	scopes: [Scopes.Plans.Write],
	body: CopyProductParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { db, org, env: fromEnv, authType } = ctx;
		const { product_id: fromProductId } = c.req.param();
		const { env: toEnv, id: toId, name: toName } = body;

		const fromNamedSandboxDashboard =
			authType === AuthType.Dashboard &&
			org.is_sandbox === true &&
			!!c.req.header(SANDBOX_ORG_HEADER) &&
			!!org.created_by;
		const promoting =
			fromNamedSandboxDashboard &&
			!(await isSameEnvVariantCopy({ ctx, fromProductId, toEnv }));

		const toOrg = promoting
			? await OrgService.get({ db, orgId: org.created_by as string })
			: org;

		await copyProductForOrgs({
			ctx,
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
