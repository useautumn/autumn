import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import { isAlienRequestError } from "../common/alienRequestError.js";
import { hostedQuery } from "../common/hostedQuery.js";
import type { AlienApi } from "../types/alienApi.js";

const NOT_FOUND = 404;

/** The group a customer's earlier setup links created, if any. Hosted only: the local manager has no external ids. */
export const findDeploymentGroupByExternalId = async ({
	api,
	externalId,
}: {
	api: AlienApi;
	externalId: string;
}): Promise<{ id: string } | null> => {
	try {
		return await alienRequest({
			api,
			method: "GET",
			path: `/v1/deployment-groups/by-external-id${hostedQuery({ api, withProject: true, params: { externalId } })}`,
			schema: z.object({ id: z.string() }),
		});
	} catch (error) {
		if (isAlienRequestError(error) && error.status === NOT_FOUND) return null;
		throw error;
	}
};
