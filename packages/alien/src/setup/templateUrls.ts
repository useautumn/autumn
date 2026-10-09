import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import { AlienRequestError } from "../common/alienRequestError.js";
import { hostedQuery } from "../common/hostedQuery.js";
import type { AlienApi } from "../types/alienApi.js";

/** The project's CloudFormation template: public, and the same for every setup link. */
export const getAwsTemplateUrl = async ({
	api,
	project,
}: {
	api: AlienApi;
	project: string;
}): Promise<string> => {
	const path = `/v1/projects/${encodeURIComponent(project)}/template-urls`;
	const { aws } = await alienRequest({
		api,
		method: "GET",
		path: `${path}${hostedQuery({ api })}`,
		schema: z.object({
			aws: z.object({ templateUrl: z.string() }).nullable().optional(),
		}),
	});
	if (!aws)
		throw new AlienRequestError({
			path,
			status: null,
			detail: "the project has no AWS template",
		});
	return aws.templateUrl;
};
