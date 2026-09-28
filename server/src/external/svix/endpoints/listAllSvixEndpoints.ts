import { ErrCode, RecaseError } from "@autumn/shared";
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
				// Not an empty list: callers would read it as every webhook deleted.
				if (error instanceof ApiException && error.code === 404)
					throw new RecaseError({
						message: "This environment's webhooks no longer exist",
						code: ErrCode.OrgNotFound,
						statusCode: 404,
					});
				throw error;
			});
		endpoints.push(...page.data);
		if (page.done || !page.iterator) return endpoints;
		iterator = page.iterator;
	}
};
