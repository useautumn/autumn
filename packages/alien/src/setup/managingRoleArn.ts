import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import { AlienRequestError } from "../common/alienRequestError.js";
import { hostedQuery } from "../common/hostedQuery.js";
import type { AlienApi } from "../types/alienApi.js";

const ManagerSchema = z.object({
	id: z.string(),
	isSystem: z.boolean(),
	managementConfigs: z
		.object({
			aws: z.object({ managingRoleArn: z.string() }).optional(),
		})
		.nullable()
		.optional(),
});

/** The role the template lets alien assume: the project's AWS manager if it names one, else alien's own. */
export const getManagingRoleArn = async ({
	api,
	project,
}: {
	api: AlienApi;
	project: string;
}): Promise<string> => {
	const path = "/v1/managers";
	const [{ defaultManagers }, managers] = await Promise.all([
		alienRequest({
			api,
			method: "GET",
			path: `/v1/projects/${encodeURIComponent(project)}${hostedQuery({ api })}`,
			schema: z.object({
				defaultManagers: z
					.record(z.string(), z.string())
					.nullable()
					.optional()
					.catch(null),
			}),
		}),
		alienRequest({
			api,
			method: "GET",
			path: `${path}${hostedQuery({ api })}`,
			schema: z.array(ManagerSchema),
		}),
	]);
	const projectManagerId = defaultManagers?.aws;
	const manager = projectManagerId
		? managers.find(({ id }) => id === projectManagerId)
		: managers.find(({ isSystem }) => isSystem);
	const managingRoleArn = manager?.managementConfigs?.aws?.managingRoleArn;
	if (!managingRoleArn)
		throw new AlienRequestError({
			path,
			status: null,
			detail: "no manager has an AWS managing role",
		});
	return managingRoleArn;
};
