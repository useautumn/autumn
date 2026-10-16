import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import {
	findDeploymentGroupByExternalId,
	renameDeploymentGroup,
} from "../deploymentGroups/deploymentGroups.js";
import { AlienDeploymentSchema } from "../deployments/deploymentSchemas.js";
import { toComputeSettings } from "../deployments/toComputeSettings.js";
import type { AlienApi, AlienContext } from "../types/alienApi.js";
import type {
	AlienContainerResources,
	AlienEnvironmentVariable,
	AlienFixedPools,
	AlienNetwork,
	AlienSetup,
} from "../types/alienClient.js";
import { buildQuickCreateUrl } from "./buildQuickCreateUrl.js";
import { toDeploymentGroupName } from "./deploymentGroupName.js";
import { getManagingRoleArn } from "./managingRoleArn.js";
import { revokeSetupLinksOnceDeleted } from "./setupLinks.js";
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

/** A link nobody runs stops working after this, so one we could not revoke never stays open. */
const SETUP_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** One Atom per group: a stale link can't start a second deployment beside it. Alien applies it to groups it creates. */
const MAX_DEPLOYMENTS_PER_GROUP = 1;

/** Same external id reuses the customer's deployment group. Older links are revoked first unless a stack launched from one is still up. */
const startHostedSetup = async ({
	ctx,
	config,
	externalId,
	name,
	region,
	environmentVariables,
	pools,
	containers,
	network,
}: {
	ctx: AlienContext;
	config: { project: string; workspace: string };
	externalId: string;
	name: string;
	region: string;
	environmentVariables: AlienEnvironmentVariable[];
	pools: AlienFixedPools;
	containers: AlienContainerResources;
	network: AlienNetwork | null;
}): Promise<AlienSetup> => {
	const { api } = ctx;
	const existingGroup = await findDeploymentGroupByExternalId({
		api,
		externalId,
	});
	if (existingGroup)
		await Promise.all([
			revokeSetupLinksOnceDeleted({ ctx, deploymentGroupId: existingGroup.id }),
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
				maxDeployments: MAX_DEPLOYMENTS_PER_GROUP,
				expiresAt: new Date(Date.now() + SETUP_LINK_TTL_MS).toISOString(),
				deploymentSetupConfig: {
					metadata: {},
					policy: {
						allowedPlatforms: ["aws"],
						allowedSetupMethods: ["cloudformation"],
						stackSettings: {
							defaults: {
								compute: toComputeSettings({ pools, containers }),
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
			containers,
			network,
		}),
	};
};

/** The local manager runs no machines or networks, so only a hosted setup takes `region`, `pools`, `containers` and `network`. */
export const startSetup = ({
	ctx,
	externalId,
	label,
	region,
	environmentVariables,
	pools,
	containers,
	network,
}: {
	ctx: AlienContext;
	externalId: string;
	label: string;
	region: string;
	environmentVariables: AlienEnvironmentVariable[];
	pools: AlienFixedPools;
	containers: AlienContainerResources;
	network: AlienNetwork | null;
}): Promise<AlienSetup> => {
	const { api } = ctx;
	const name = toDeploymentGroupName({ label });
	if (api.config.kind === "local")
		return startLocalSetup({ api, name, environmentVariables });
	return startHostedSetup({
		ctx,
		config: api.config,
		externalId,
		name,
		region,
		environmentVariables,
		pools,
		containers,
		network,
	});
};
