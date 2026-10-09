import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import {
	findDeploymentGroupByExternalId,
	renameDeploymentGroup,
} from "../deploymentGroups/deploymentGroups.js";
import { AlienDeploymentSchema } from "../deployments/deploymentSchemas.js";
import { fixedPoolsToCompute } from "../deployments/fixedPoolsToCompute.js";
import type { AlienApi } from "../types/alienApi.js";
import type {
	AlienEnvironmentVariable,
	AlienFixedPools,
	AlienNetwork,
	AlienSetup,
} from "../types/alienClient.js";
import { buildQuickCreateUrl } from "./buildQuickCreateUrl.js";
import { toDeploymentGroupName } from "./deploymentGroupName.js";
import { getManagingRoleArn } from "./managingRoleArn.js";
import { revokeSetupLinks } from "./setupLinks.js";
import { getAwsTemplateUrl } from "./templateUrls.js";

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
	region,
	environmentVariables,
	pools,
	network,
}: {
	api: AlienApi;
	config: { project: string; workspace: string };
	externalId: string;
	name: string;
	region: string;
	environmentVariables: AlienEnvironmentVariable[];
	pools: AlienFixedPools;
	network: AlienNetwork | null;
}): Promise<AlienSetup> => {
	const existingGroup = await findDeploymentGroupByExternalId({
		api,
		externalId,
	});
	if (existingGroup)
		await Promise.all([
			revokeSetupLinks({ ctx: { api }, deploymentGroupId: existingGroup.id }),
			existingGroup.name !== name &&
				renameDeploymentGroup({
					api,
					deploymentGroupId: existingGroup.id,
					name,
				}),
		]);
	const [templateUrl, managingRoleArn, setup] = await Promise.all([
		getAwsTemplateUrl({ api, project: config.project }),
		getManagingRoleArn({ api, project: config.project }),
		alienRequest({
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
						stackSettings: {
							defaults: {
								compute: fixedPoolsToCompute({ pools }),
								...(network && { network }),
							},
						},
					},
					environmentVariables,
				},
				// Without a setup item the portal has nothing to run and reports setup complete.
				setupItems: [{ item: "deployment", required: true }],
			},
			schema: z.object({
				token: z.string(),
				deploymentGroup: z.object({ id: z.string() }),
			}),
		}),
	]);
	return {
		deploymentGroupId: setup.deploymentGroup.id,
		setupUrl: buildQuickCreateUrl({
			templateUrl,
			region,
			stackName: name,
			token: setup.token,
			managingRoleArn,
			pools,
			network,
		}),
	};
};

/** The local manager runs no machines or networks, so only a hosted setup takes `region`, `pools` and `network`. */
export const startSetup = ({
	ctx,
	externalId,
	label,
	region,
	environmentVariables,
	pools,
	network,
}: {
	ctx: { api: AlienApi };
	externalId: string;
	label: string;
	region: string;
	environmentVariables: AlienEnvironmentVariable[];
	pools: AlienFixedPools;
	network: AlienNetwork | null;
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
		region,
		environmentVariables,
		pools,
		network,
	});
};
