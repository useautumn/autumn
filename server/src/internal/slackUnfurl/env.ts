import { getAutumnEnv } from "@autumn/env";

const firstOf = (names: string[], fallback = ""): string => {
	for (const name of names) {
		const value = process.env[name];
		if (value) return value;
	}
	return fallback;
};

export const env = {
	SLACK_SIGNING_SECRET: firstOf(["ALU_SLACK_SIGNING_SECRET"]),
	SLACK_BOT_TOKEN: firstOf(["ALU_SLACK_BOT_TOKEN"]),
	SLACK_CHANNEL_ORG_MAP: firstOf(["ALU_SLACK_CHANNEL_ORG_MAP"], "{}"),
	APP_HOST: process.env.APP_HOST ?? "app.useautumn.com",
	AUTUMN_PUBLIC_API_URL: getAutumnEnv().AUTUMN_PUBLIC_API_URL,
};

export const isSlackUnfurlConfigured = (): boolean =>
	env.SLACK_SIGNING_SECRET !== "" && env.SLACK_BOT_TOKEN !== "";
