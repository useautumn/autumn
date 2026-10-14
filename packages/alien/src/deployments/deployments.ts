import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import { isAlienRequestError } from "../common/alienRequestError.js";
import { hostedQuery } from "../common/hostedQuery.js";
import type { AlienApi } from "../types/alienApi.js";
import type { AlienDeployment, AlienFixedPools } from "../types/alienClient.js";
import {
	isDeploymentAwaitingSetup,
	isDeploymentBeingDeleted,
	isDeploymentDeleted,
} from "./classifyDeployments.js";
import {
	AlienDeploymentListSchema,
	AlienDeploymentSchema,
} from "./deploymentSchemas.js";
import { fixedPoolsToCompute } from "./fixedPoolsToCompute.js";

const deploymentsQuery = ({
	api,
	deploymentGroupId,
}: {
	api: AlienApi;
	deploymentGroupId: string;
}) => {
	if (api.config.kind === "local")
		return new URLSearchParams({ deploymentGroupId });
	return new URLSearchParams({
		project: api.config.project,
		workspace: api.config.workspace,
		deploymentGroup: deploymentGroupId,
	});
};

const listGroupDeployments = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: { api: AlienApi };
	deploymentGroupId: string;
}): Promise<AlienDeployment[]> => {
	const query = deploymentsQuery({ api: ctx.api, deploymentGroupId });
	const { items } = await alienRequest({
		api: ctx.api,
		method: "GET",
		path: `/v1/deployments?${query}`,
		schema: AlienDeploymentListSchema,
	});
	return items;
};

export const findDeployment = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: { api: AlienApi };
	deploymentGroupId: string;
}): Promise<AlienDeployment | null> => {
	const items = await listGroupDeployments({ ctx, deploymentGroupId });
	const live = items.find(
		(deployment) => !isDeploymentBeingDeleted({ deployment }),
	);
	return live ? readDeployment({ ctx, deployment: live }) : null;
};

export const hasUndeletedDeployment = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: { api: AlienApi };
	deploymentGroupId: string;
}): Promise<boolean> => {
	const items = await listGroupDeployments({ ctx, deploymentGroupId });
	return items.some((deployment) => !isDeploymentDeleted({ deployment }));
};

const NOT_FOUND = 404;

const deploymentPath = ({
	api,
	deploymentId,
	action = "",
}: {
	api: AlienApi;
	deploymentId: string;
	action?: string;
}) =>
	`/v1/deployments/${encodeURIComponent(deploymentId)}${action}${hostedQuery({ api })}`;

export const getDeployment = async ({
	ctx,
	deploymentId,
}: {
	ctx: { api: AlienApi };
	deploymentId: string;
}): Promise<AlienDeployment | null> => {
	try {
		return await alienRequest({
			api: ctx.api,
			method: "GET",
			path: deploymentPath({ api: ctx.api, deploymentId }),
			schema: AlienDeploymentSchema,
		});
	} catch (error) {
		if (isAlienRequestError(error) && error.status === NOT_FOUND) return null;
		throw error;
	}
};

const readDeployment = ({
	ctx,
	deployment,
}: {
	ctx: { api: AlienApi };
	deployment: AlienDeployment;
}): Promise<AlienDeployment> =>
	ctx.api.config.kind === "local"
		? Promise.resolve(deployment)
		: alienRequest({
				api: ctx.api,
				method: "GET",
				path: deploymentPath({ api: ctx.api, deploymentId: deployment.id }),
				schema: AlienDeploymentSchema,
			});

export const deleteDeployment = async ({
	ctx,
	deployment,
}: {
	ctx: { api: AlienApi };
	deployment: AlienDeployment;
}): Promise<void> => {
	const action = isDeploymentAwaitingSetup({ deployment })
		? "forget"
		: "cleanup";
	await alienRequest({
		api: ctx.api,
		method: "POST",
		path: deploymentPath({
			api: ctx.api,
			deploymentId: deployment.id,
			action: "/delete",
		}),
		body: { action },
		schema: z.unknown(),
	});
};

export const updateDeploymentCompute = async ({
	ctx,
	deployment,
	pools,
}: {
	ctx: { api: AlienApi };
	deployment: AlienDeployment;
	pools: AlienFixedPools;
}): Promise<void> => {
	if (ctx.api.config.kind === "local") return;
	await alienRequest({
		api: ctx.api,
		method: "PATCH",
		path: deploymentPath({
			api: ctx.api,
			deploymentId: deployment.id,
			action: "/compute",
		}),
		body: { compute: fixedPoolsToCompute({ pools }) },
		schema: z.unknown(),
	});
};

export const retryDeployment = async ({
	ctx,
	deployment,
}: {
	ctx: { api: AlienApi };
	deployment: AlienDeployment;
}): Promise<void> => {
	await alienRequest({
		api: ctx.api,
		method: "POST",
		path: deploymentPath({
			api: ctx.api,
			deploymentId: deployment.id,
			action: "/retry",
		}),
		schema: z.unknown(),
	});
};
