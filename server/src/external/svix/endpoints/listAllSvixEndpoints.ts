import { ApiException, type EndpointOut } from "svix";
import { createSvixCli } from "../svixUtils.js";

const PAGE_SIZE = 250;

export const listAllSvixEndpoints = async ({
	appId,
}: {
	appId: string;
}): Promise<EndpointOut[]> => {
	const svix = createSvixCli();
	const endpoints: EndpointOut[] = [];
	let iterator: string | undefined;

	for (;;) {
		const page = await svix.endpoint
			.list(appId, { limit: PAGE_SIZE, iterator })
			.catch((error) => {
				// A deleted app has no endpoints.
				if (error instanceof ApiException && error.code === 404)
					return { data: [], done: true, iterator: null };
				throw error;
			});
		endpoints.push(...page.data);
		if (page.done || !page.iterator) return endpoints;
		iterator = page.iterator;
	}
};
