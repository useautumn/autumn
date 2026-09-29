import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import { hostedQuery } from "../common/hostedQuery.js";
import type { AlienApi } from "../types/alienApi.js";

const SETUP_LINK_ROLE = "deployment-group.deployer";
const API_KEYS_PAGE_SIZE = "100";

const ApiKeyPageSchema = z.object({
	items: z.array(
		z.object({
			id: z.string(),
			role: z.string(),
			deploymentGroupId: z.string().nullable(),
			revokedAt: z.string().nullable(),
		}),
	),
	nextCursor: z.string().nullable().optional(),
});

type ApiKey = z.infer<typeof ApiKeyPageSchema>["items"][number];

const isActiveSetupLinkOf = ({
	apiKey,
	deploymentGroupId,
}: {
	apiKey: ApiKey;
	deploymentGroupId: string;
}) =>
	apiKey.role === SETUP_LINK_ROLE &&
	apiKey.deploymentGroupId === deploymentGroupId &&
	apiKey.revokedAt === null;

/** alien's key list has no group filter, so this pages through the project's keys. */
const listSetupLinkKeyIds = async ({
	api,
	deploymentGroupId,
}: {
	api: AlienApi;
	deploymentGroupId: string;
}): Promise<string[]> => {
	const keyIds: string[] = [];
	let cursor: string | null | undefined;
	do {
		const page = await alienRequest({
			api,
			method: "GET",
			path: `/v1/api-keys${hostedQuery({ api, withProject: true, params: { limit: API_KEYS_PAGE_SIZE, ...(cursor && { cursor }) } })}`,
			schema: ApiKeyPageSchema,
		});
		for (const apiKey of page.items)
			if (isActiveSetupLinkOf({ apiKey, deploymentGroupId }))
				keyIds.push(apiKey.id);
		cursor = page.nextCursor;
	} while (cursor);
	return keyIds;
};

/** Every setup link is its own group-scoped key; revoking them leaves the group with no way in until the next one is minted. */
export const revokeSetupLinks = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: { api: AlienApi };
	deploymentGroupId: string;
}): Promise<void> => {
	const { api } = ctx;
	if (api.config.kind === "local") return;
	const keyIds = await listSetupLinkKeyIds({ api, deploymentGroupId });
	for (const keyId of keyIds)
		await alienRequest({
			api,
			method: "DELETE",
			path: `/v1/api-keys/${encodeURIComponent(keyId)}${hostedQuery({ api })}`,
			schema: z.unknown(),
		});
};
