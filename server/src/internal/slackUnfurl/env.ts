/**
 * Slack-unfurl config, read from the server's env. NON-throwing on purpose:
 * this module is imported by the main server, so a missing Slack secret must
 * NOT crash boot — handlers fail closed (401 / no-op) instead.
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
	/**
	 * Publicly reachable base url of the server (used to build the card image_url).
	 * Falls back to NGROK_URL — the server's existing dev-tunnel convention (also
	 * used by stripe/revenuecat) — so local testing needs no extra var.
	 */
	PUBLIC_BASE_URL: firstOf([
		"ALU_PUBLIC_BASE_URL",
		"PUBLIC_BASE_URL",
		"NGROK_URL",
	]),
};

/** True only when the Slack creds are present — handlers no-op otherwise. */
export const isSlackUnfurlConfigured = (): boolean =>
	env.SLACK_SIGNING_SECRET !== "" && env.SLACK_BOT_TOKEN !== "";
