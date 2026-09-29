import { Svix } from "svix";
import { appPortalUrl, createApp, deleteApp } from "./apps/apps.js";
import { listEndpoints } from "./endpoints/listEndpoints.js";
import { sendMessage } from "./messages/sendMessage.js";
import type { SvixClient } from "./types/svixClient.js";

/** One SDK instance behind named methods; the API key is the caller's to read, never the environment's. */
export const createSvixClient = ({
	config,
}: {
	config: { apiKey: string };
}): SvixClient => {
	const ctx = { svix: new Svix(config.apiKey) };
	return {
		createApp: (params) => createApp({ ctx, ...params }),
		deleteApp: (params) => deleteApp({ ctx, ...params }),
		appPortalUrl: (params) => appPortalUrl({ ctx, ...params }),
		sendMessage: (params) => sendMessage({ ctx, ...params }),
		listEndpoints: (params) => listEndpoints({ ctx, ...params }),
	};
};
