import { createTinybirdApi } from "@tinybirdco/sdk";
import { createGzipEventsFetch } from "./common/gzipEventsFetch.js";
import type {
	TinybirdClient,
	TinybirdClientConfig,
} from "./types/tinybirdClient.js";

export const createTinybirdClient = ({
	config,
}: {
	config: TinybirdClientConfig;
}): TinybirdClient => {
	const api = createTinybirdApi({
		baseUrl: config.region.baseUrl,
		token: config.region.token,
		timeout: config.timeoutMs,
		fetch: createGzipEventsFetch({ fetch: config.fetch ?? fetch }),
	});
	return { api };
};
