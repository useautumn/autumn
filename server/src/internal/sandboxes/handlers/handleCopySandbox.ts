import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { copySandboxForOrg } from "../copySandbox.js";
import {
	assertDashboardActor,
	assertNotSandboxContext,
} from "../createSandbox.js";

const CopySandboxSchema = z
	.object({
		// Source is exactly one of: another owned sandbox (fromSandboxId), or the
		// master org's current env — default sandbox / production — via fromMaster.
		fromSandboxId: z.string().min(1).optional(),
		// boolean (not z.literal(true)) so clients that serialize `false` instead
		// of omitting still parse; the refine treats falsy as "no master source".
		fromMaster: z.boolean().optional(),
		toSandboxId: z.string().min(1),
		// Omit both to copy the whole catalog; pass either to copy only those items
		// (selected products pull in the features they reference).
		productIds: z.array(z.string()).optional(),
		featureIds: z.array(z.string()).optional(),
	})
	.refine((d) => (d.fromSandboxId ? 1 : 0) + (d.fromMaster ? 1 : 0) === 1, {
		message: "Provide exactly one of fromSandboxId or fromMaster",
	});

/**
 * POST /sandboxes.copy
 *
 * Dashboard-only RPC that copies plans (products) + features into a named
 * sandbox. The source is another owned sandbox, or — via fromMaster — the master
 * org at the caller's current env (so you can seed a sandbox from the default
 * sandbox or from production). Ownership is enforced inside copySandboxForOrg via
 * the 404-masking getOwnedSandbox check, so a non-owned endpoint reads as a 404.
 */
export const handleCopySandbox = createRoute({
	scopes: [Scopes.Platform.Write],
	body: CopySandboxSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, env, user, authType } = ctx;

		assertNotSandboxContext(masterOrg);
		assertDashboardActor({ authType, user });

		const { fromSandboxId, fromMaster, toSandboxId, productIds, featureIds } =
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
			fromOrg: fromMaster ? masterOrg : undefined,
			fromEnv: fromMaster ? env : undefined,
			toSandboxId,
			productIds,
			featureIds,
		});

		return c.json({ success: true });
	},
});
