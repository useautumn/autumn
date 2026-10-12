import { z } from "zod/v4";
import { alienRequest } from "../common/alienRequest.js";
import { isAlienRequestError } from "../common/alienRequestError.js";
import { hostedQuery } from "../common/hostedQuery.js";
import { hasUndeletedDeployment } from "../deployments/deployments.js";
import type { AlienApi, AlienContext } from "../types/alienApi.js";

const SETUP_LINK_ROLE = "deployment-group.deployer";
const FORBIDDEN = 403;
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

/** A key our role may not revoke is left to expire (every link we mint does, within a week); any other failure still fails. */
const revokeSetupLink = async ({
	ctx: { api, logger },
	keyId,
	deploymentGroupId,
}: {
	ctx: AlienContext;
	keyId: string;
	deploymentGroupId: string;
}): Promise<void> => {
	try {
		await alienRequest({
			api,
			method: "DELETE",
			path: `/v1/api-keys/${encodeURIComponent(keyId)}${hostedQuery({ api })}`,
			schema: z.unknown(),
		});
	} catch (error) {
		if (!isAlienRequestError(error) || error.status !== FORBIDDEN) throw error;
		logger.warn(
			"alien refused to revoke a setup link; it stays until it expires",
			{
				keyId,
				deploymentGroupId,
			},
		);
	}
};

/** Every setup link is its own group-scoped key. A stack's delete calls alien with the link it was launched from,
 *  so the links stay until alien has deleted every deployment of the group. */
export const revokeSetupLinksOnceDeleted = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AlienContext;
	deploymentGroupId: string;
}): Promise<void> => {
	if (ctx.api.config.kind === "local") return;
	if (await hasUndeletedDeployment({ ctx, deploymentGroupId })) return;
	const keyIds = await listSetupLinkKeyIds({ api: ctx.api, deploymentGroupId });
	for (const keyId of keyIds)
		await revokeSetupLink({ ctx, keyId, deploymentGroupId });
};
