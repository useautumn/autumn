import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { getRevenuecatAccessToken } from "../misc/getRevenuecatAccessToken";
import { initRevenuecatCli } from "../misc/initRevenuecatCli";

export const handleGetRevenueCatProjects = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const revenueCatConfig = org.processor_configs?.revenuecat;

		if (!revenueCatConfig) {
			return c.json({ projects: [] }, 404);
		}

		const accessToken = await getRevenuecatAccessToken({ db, org, env });

		if (!accessToken) {
			return c.json({ projects: [] }, 404);
		}

		const rcCli = initRevenuecatCli({ accessToken });
		const projects = await rcCli.listProjects();

		return c.json(projects);
	},
});

export const handleCreateRevenueCatProject = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: z.object({ name: z.string().min(1).max(255) }),
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { name } = c.req.valid("json");

		const accessToken = await getRevenuecatAccessToken({ db, org, env });
		if (!accessToken) {
			throw new RecaseError({
				message: "Connect RevenueCat via OAuth before creating a project",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const rcCli = initRevenuecatCli({ accessToken });
		const project = await rcCli.createProject({ name });

		return c.json({ id: project.id, name: project.name });
	},
});
