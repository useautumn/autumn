import { getAutumnEnv } from "@autumn/env";

/**
 * Slack-unfurl config, read from the server's env. Missing Slack secrets do not
 * crash boot — handlers fail closed (401 / no-op) instead. The shared API URL
 * remains part of the required server environment.
 *
 * Strictly `ALU_`-prefixed: the bare `SLACK_*` names belong to other apps in the
 * shared vault (e.g. leaf), so reading them would silently sign/verify with the
 * wrong app's secret.
 */
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
	/** JSON map: { "<channel_id>": "<org_id>" }. The tenancy key. */
	SLACK_CHANNEL_ORG_MAP: firstOf(["ALU_SLACK_CHANNEL_ORG_MAP"], "{}"),
	/** Host whose /customers/<id> links we unfurl. */
	APP_HOST: process.env.APP_HOST ?? "app.useautumn.com",
	AUTUMN_PUBLIC_API_URL: getAutumnEnv().AUTUMN_PUBLIC_API_URL,
};

/** True only when the Slack creds are present — handlers no-op otherwise. */
export const isSlackUnfurlConfigured = (): boolean =>
	env.SLACK_SIGNING_SECRET !== "" && env.SLACK_BOT_TOKEN !== "";
