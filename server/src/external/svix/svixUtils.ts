import type { Organization } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import { Svix } from "svix";
import { logger } from "../logtail/logtailUtils.js";

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
}) => {
	const svixConfig = org.svix_config;
	return env === AppEnv.Live
		? svixConfig?.live_app_id
		: svixConfig?.sandbox_app_id;
};
