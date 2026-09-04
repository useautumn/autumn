import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { provisionAgentOrg } from "../actions/provisionAgentOrg.js";

const ProvisionAgentOrgSchema = z.object({
	name: z.string().trim().min(1).max(100),
	slug: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/),
});

export const handleProvisionAgentOrg = createRoute({
	scopes: [Scopes.Public],
	body: ProvisionAgentOrgSchema,
	handler: async (c) => {
		const { name, slug } = c.req.valid("json");
		const provisioned = await provisionAgentOrg({
			db: c.get("ctx").db,
			name,
			slug,
		});

		return c.json({
			organization_id: provisioned.organization.id,
			organization_slug: provisioned.organization.slug,
			api_key: provisioned.apiKey,
			claim_token: provisioned.claimToken,
			claim_url: provisioned.claimUrl,
			claim_expires_at: provisioned.claimExpiresAt.toISOString(),
		});
	},
});
