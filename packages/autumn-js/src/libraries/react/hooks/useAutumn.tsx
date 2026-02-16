import type { ConvexAutumnClient } from "../client/ConvexAutumnClient";
import type { AutumnClient } from "../client/ReactAutumnClient";
import { useAutumnContext } from "../AutumnContext";
import { useAutumnBase } from "./helpers/useAutumnBase";

type UseAutumnParams = {
	client?: AutumnClient | ConvexAutumnClient;
};

export const useAutumn = (params?: UseAutumnParams) => {
	const context = params?.client
		? undefined
		: useAutumnContext({
				name: "useAutumn",
			});

	const client = params?.client ?? context!.client;

	return useAutumnBase({
		context,
		client,
	});
};
