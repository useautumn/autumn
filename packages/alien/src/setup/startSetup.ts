import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import { findDeploymentGroupByExternalId } from "../deploymentGroups/deploymentGroups.js";
import { AlienDeploymentSchema } from "../deployments/deploymentSchemas.js";
import type { AlienApi } from "../types/alienApi.js";
import type {
	AlienEnvironmentVariable,
	AlienSetup,
} from "../types/alienClient.js";
import { toDeploymentGroupName } from "./deploymentGroupName.js";
import { revokeSetupLinks } from "./setupLinks.js";

/** The local manager has no setup links; deploying straight away stands in for the customer running the setup. */
const startLocalSetup = async ({
	api,
	name,
	environmentVariables,
}: {
	api: AlienApi;
	name: string;
	environmentVariables: AlienEnvironmentVariable[];
}): Promise<AlienSetup> => {
	const group = await alienRequest({
		api,
		method: "POST",
		path: "/v1/deployment-groups",
		body: { name },
		schema: z.object({ id: z.string() }),
	});
	await alienRequest({
		api,
		method: "POST",
		path: "/v1/deployments",
		body: {
			name,
			platform: "local",
			deploymentGroupId: group.id,
			environmentVariables,
		},
		schema: z.object({ deployment: AlienDeploymentSchema }),
	});
	return { deploymentGroupId: group.id, setupUrl: null };
};

/** Same external id reuses the customer's deployment group. Older links are revoked first, so one is ever live. */
const startHostedSetup = async ({
	api,
	config,
	externalId,
	name,
	environmentVariables,
}: {
	api: AlienApi;
	config: { project: string; workspace: string };
	externalId: string;
	name: string;
	environmentVariables: AlienEnvironmentVariable[];
}): Promise<AlienSetup> => {
	const existingGroup = await findDeploymentGroupByExternalId({
		api,
		externalId,
	});
	if (existingGroup)
		await revokeSetupLinks({
			ctx: { api },
			deploymentGroupId: existingGroup.id,
		});
	const setup = await alienRequest({
		api,
		method: "POST",
		path: `/v1/deployment-groups/setup-links?workspace=${encodeURIComponent(config.workspace)}`,
		body: {
			project: config.project,
			externalId,
			name,
			deploymentSetupConfig: {
				metadata: {},
				policy: {
					allowedPlatforms: ["aws"],
					allowedSetupMethods: ["cloudformation"],
				},
				environmentVariables,
			},
			// Without a setup item the portal has nothing to run and reports setup complete.
			setupItems: [{ item: "deployment", required: true }],
		},
		schema: z.object({
			deploymentLink: z.string(),
			deploymentGroup: z.object({ id: z.string() }),
		}),
	});
	return {
		deploymentGroupId: setup.deploymentGroup.id,
		setupUrl: setup.deploymentLink,
	};
};

export const startSetup = ({
	ctx,
	externalId,
	label,
	environmentVariables,
}: {
	ctx: { api: AlienApi };
	externalId: string;
	label: string;
	environmentVariables: AlienEnvironmentVariable[];
}): Promise<AlienSetup> => {
	const { api } = ctx;
	const name = toDeploymentGroupName({ label });
	if (api.config.kind === "local")
		return startLocalSetup({ api, name, environmentVariables });
	return startHostedSetup({
		api,
		config: api.config,
		externalId,
		name,
		environmentVariables,
	});
};
