import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import { hostedQuery } from "../common/hostedQuery.js";
import type { AlienApi } from "../types/alienApi.js";
import type { AlienDeployment, AlienFixedPools } from "../types/alienClient.js";
import {
	isDeploymentAwaitingSetup,
	isDeploymentBeingDeleted,
} from "./classifyDeployments.js";
import {
	AlienDeploymentListSchema,
	AlienDeploymentSchema,
} from "./deploymentSchemas.js";
import { fixedPoolsToCompute } from "./fixedPoolsToCompute.js";

/** The local manager filters by `deploymentGroupId`; the hosted API by `deploymentGroup`, scoped to a project. */
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

/** The group's live deployment: the one its setup created. One being deleted is already gone for every caller. */
export const findDeployment = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: { api: AlienApi };
	deploymentGroupId: string;
}): Promise<AlienDeployment | null> => {
	const query = deploymentsQuery({ api: ctx.api, deploymentGroupId });
	const { items } = await alienRequest({
		api: ctx.api,
		method: "GET",
		path: `/v1/deployments?${query}`,
		schema: AlienDeploymentListSchema,
	});
	const live = items.find(
		(deployment) => !isDeploymentBeingDeleted({ deployment }),
	);
	return live ? readDeployment({ ctx, deployment: live }) : null;
};

/** The hosted list leaves out `stackState`, so the endpoint is read from the record itself. */
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
				path: `/v1/deployments/${encodeURIComponent(deployment.id)}${hostedQuery({ api: ctx.api })}`,
				schema: AlienDeploymentSchema,
			});

/** A deployment that never ran is forgotten: cleanup would wait forever on resources that were never made.
 *  One that ran is cleaned up; setup-owned resources stay until the customer removes their stack. */
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
		path: `/v1/deployments/${encodeURIComponent(deployment.id)}/delete${hostedQuery({ api: ctx.api })}`,
		body: { action },
		schema: z.unknown(),
	});
};

/** Same machines is a no-op on alien's side. The local manager runs no machines, so it has nothing to change. */
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
		path: `/v1/deployments/${encodeURIComponent(deployment.id)}/compute${hostedQuery({ api: ctx.api })}`,
		body: { compute: fixedPoolsToCompute({ pools }) },
		schema: z.unknown(),
	});
};
