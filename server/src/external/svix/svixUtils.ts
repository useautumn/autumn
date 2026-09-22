import type { AppEnv, Organization } from "@autumn/shared";
import {
	createSvixClient,
	type SvixClient,
	svixConfigToAppId,
} from "@autumn/svix";
import { Svix } from "svix";
import { logger } from "../logtail/logtailUtils.js";

let svixClient: SvixClient | undefined;

/** The server's one client; null until SVIX_API_KEY is set. */
export const getSvixClient = (): SvixClient | null => {
	const apiKey = process.env.SVIX_API_KEY;
	if (!apiKey) return null;
	svixClient ??= createSvixClient({ config: { apiKey } });
	return svixClient;
};

/** The raw SDK, for the few calls the client has no method for yet. */
export const createSvixCli = () => {
	return new Svix(process.env.SVIX_API_KEY as string);
};

export function safeSvix<T extends (...args: any[]) => any>({
	fn,
	action,
}: {
	fn: T;
	action: string;
}): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
	return async (...args: Parameters<T>) => {
		if (!process.env.SVIX_API_KEY) {
			logger.warn(`SVIX_API_KEY is not set, skipping ${action}`);
			return;
		}
		try {
			return await fn(...args);
		} catch (error) {
			logger.error(`Error ${action}: ${error}`);
		}
	};
}

export const getSvixAppId = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => svixConfigToAppId({ svixConfig: org.svix_config, env }) ?? undefined;
