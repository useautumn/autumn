import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resourcesToMachine } from "@/internal/byoc/utils/byocCacheUtils.js";
import { deleteShadowAtom } from "@/internal/misc/shadowAtom/actions/deleteShadowAtom.js";
import { findShadowAtom } from "@/internal/misc/shadowAtom/actions/findShadowAtom.js";
import { resizeShadowAtom } from "@/internal/misc/shadowAtom/actions/resizeShadowAtom.js";
import { startShadowAtom } from "@/internal/misc/shadowAtom/actions/startShadowAtom.js";

const MachineSchema = z.object({
	cpu: z.number().positive(),
	memory: z.number().positive(),
});

export const handleGetAdminShadowAtomDeployment = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const deployment = await findShadowAtom();
		if (!deployment) return c.json({ deployment: null });
		const { machine } = deployment;
		return c.json({
			deployment: {
				deployment_group_id: deployment.deploymentGroupId,
				status: deployment.status,
				endpoint_url: deployment.endpointUrl,
				machine: machine && { cpu: machine.cpu, memory: machine.memory },
			},
		});
	},
});

/** Starts our shadow Atom on alien with the admin token hash the token mint returned. */
export const handleCreateAdminShadowAtomDeployment = createRoute({
	scopes: [Scopes.Superuser],
	body: MachineSchema.extend({ admin_token_hash: z.string().min(1) }),
	handler: async (c) => {
		const { admin_token_hash, ...resources } = c.req.valid("json");
		const setup = await startShadowAtom({
			adminTokenHash: admin_token_hash,
			machine: resourcesToMachine(resources),
		});
		return c.json({
			deployment_group_id: setup.deploymentGroupId,
			setup_url: setup.setupUrl,
		});
	},
});

export const handleResizeAdminShadowAtomDeployment = createRoute({
	scopes: [Scopes.Superuser],
	body: MachineSchema,
	handler: async (c) => {
		await resizeShadowAtom({
			machine: resourcesToMachine(c.req.valid("json")),
		});
		return c.json({ resized: true });
	},
});

export const handleDeleteAdminShadowAtomDeployment = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		await deleteShadowAtom();
		return c.json({ deleted: true });
	},
});
