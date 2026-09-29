import { getHeraldEnv } from "@autumn/env/herald";
import { createSvixClient, type SvixClient } from "@autumn/svix";

let svixClient: SvixClient | null | undefined;

/** Null where Svix is not set up: webhooks are decided and none delivered. */
export function getSvixClient(): SvixClient | null {
	if (svixClient !== undefined) return svixClient;
	const { HERALD_SVIX_API_KEY } = getHeraldEnv();
	svixClient = HERALD_SVIX_API_KEY
		? createSvixClient({ config: { apiKey: HERALD_SVIX_API_KEY } })
		: null;
	return svixClient;
}
