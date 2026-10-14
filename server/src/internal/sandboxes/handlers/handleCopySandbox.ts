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
		fromSandboxId: z.string().min(1).optional(),
		fromMaster: z.boolean().optional(),
		toSandboxId: z.string().min(1),
		productIds: z.array(z.string()).optional(),
		featureIds: z.array(z.string()).optional(),
	})
	.refine((d) => (d.fromSandboxId ? 1 : 0) + (d.fromMaster ? 1 : 0) === 1, {
		message: "Provide exactly one of fromSandboxId or fromMaster",
	});

export const handleCopySandbox = createRoute({
	scopes: [Scopes.Platform.Write],
	body: CopySandboxSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org: masterOrg, env, user, authType } = ctx;

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
