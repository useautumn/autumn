import type { ListWebhooksResponse } from "../../../generated/client";

export type RemoteWebhook = ListWebhooksResponse["list"][number];

/** A config webhook as evaluated: `url` still holds every env's value. */
export type StatedWebhook = Record<string, unknown> & {
	id: string;
	url?: Record<string, unknown>;
};

/** The in-memory sources a pull edits, plus where the config lives. */
export type PullFiles = { configPath: string; files: Map<string, string> };

export type WebhookEditResult = {
	/** Printed as they land, in the `+ / ~ / -` style of the other lanes. */
	lines: string[];
	/** Values the config states in code pull must not rewrite. */
	warnings: string[];
	unlocated: { id: string; action: string }[];
};
