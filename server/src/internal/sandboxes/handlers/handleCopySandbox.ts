import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { copySandboxForOrg } from "../copySandbox.js";
import {
	assertDashboardActor,
	assertNotSandboxContext,
} from "../createSandbox.js";

const CopySandboxSchema = z.object({
	fromSandboxId: z.string().min(1),
	toSandboxId: z.string().min(1),
	// Omit both to copy the whole catalog; pass either to copy only those items
	// (selected products pull in the features they reference).
	productIds: z.array(z.string()).optional(),
	featureIds: z.array(z.string()).optional(),
});

/**
 * POST /sandboxes.copy
 *
 * Dashboard-only RPC that copies plans (products) + features from one named
 * sandbox into another. Both must be sandbox sub-orgs owned by the caller's
 * master org; ownership is enforced inside copySandboxForOrg via the 404-masking
 * getOwnedSandbox check, so a non-owned source or target reads as a 404.
 */
export const handleCopySandbox = createRoute({
	scopes: [Scopes.Platform.Write],
	body: CopySandboxSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, user, authType } = ctx;

		assertNotSandboxContext(masterOrg);
		assertDashboardActor({ authType, user });

		const { fromSandboxId, toSandboxId, productIds, featureIds } =
			c.req.valid("json");

		if (fromSandboxId === toSandboxId) {
			throw new RecaseError({
				message: "Source and target sandboxes must be different",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		await copySandboxForOrg({
			db,
			ctx,
			masterOrg,
			fromSandboxId,
			toSandboxId,
			productIds,
			featureIds,
		});

		return c.json({ success: true });
	},
});
