import dotenv from "dotenv";
dotenv.config();

import { PostHog } from "posthog-node";
import { logger } from "../logtail/logtailUtils.js";

export const createPosthogCli = () => {
	if (!process.env.POSTHOG_API_KEY) {
		logger.warn("POSTHOG_API_KEY not set, skipping posthog");
		return null;
	}

	return new PostHog(process.env.POSTHOG_API_KEY, {
		host: process.env.POSTHOG_HOST_URL ?? "https://us.i.posthog.com",
	});
};
