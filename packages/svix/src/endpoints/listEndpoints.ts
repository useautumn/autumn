import type { Svix } from "svix";
import type { SvixEndpoint } from "../types/svixClient.js";

export const listEndpoints = async ({
	ctx,
	appId,
}: {
	ctx: { svix: Svix };
	appId: string;
}): Promise<SvixEndpoint[]> => {
	const { data } = await ctx.svix.endpoint.list(appId);
	return data.map((endpoint) => ({
		id: endpoint.id,
		url: endpoint.url,
		filterTypes: endpoint.filterTypes ?? [],
		disabled: endpoint.disabled ?? false,
	}));
};
