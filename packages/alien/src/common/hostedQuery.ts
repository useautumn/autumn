import type { AlienApi } from "../types/alienApi.js";

export const hostedQuery = ({
	api,
	withProject = false,
	params = {},
}: {
	api: AlienApi;
	withProject?: boolean;
	params?: Record<string, string>;
}): string => {
	if (api.config.kind === "local") {
		const query = new URLSearchParams(params).toString();
		return query ? `?${query}` : "";
	}
	const query = new URLSearchParams({
		workspace: api.config.workspace,
		...(withProject && { project: api.config.project }),
		...params,
	});
	return `?${query}`;
};
