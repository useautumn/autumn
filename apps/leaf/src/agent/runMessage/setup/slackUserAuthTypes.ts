import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";

export type SlackAuthDenyReason =
	| "installation-org-mismatch"
	| "slack-email-unavailable"
	| "no-autumn-user"
	| "ambiguous-autumn-user"
	| "not-a-member"
	| "invalid-role"
	| "no-supported-scopes";

export const DENY_TEXT: Record<SlackAuthDenyReason, string> = {
	"installation-org-mismatch":
		"I couldn't verify this Slack installation for the Autumn organization. Please try again, or ask an admin to reconnect Autumn if this keeps happening.",
	"slack-email-unavailable":
		"I couldn't read your Slack email, so I can't verify your Autumn permissions. The workspace may need to reconnect the Autumn app to grant the new permission; please ask a workspace admin to reconnect Autumn.",
	"no-autumn-user":
		"I couldn't find an Autumn account matching your Slack email. Sign in to Autumn with the same email address, or ask an admin to invite you.",
	"ambiguous-autumn-user":
		"Multiple Autumn accounts share your Slack email, so I can't tell which one is you. Ask an admin to resolve the duplicate accounts before I can act on your behalf.",
	"not-a-member":
		"Your Autumn account isn't a member of this workspace's Autumn organization, so I can't act on your behalf here. Ask an admin to add you.",
	"invalid-role":
		"Your role in this Autumn organization isn't recognized, so I can't grant any permissions. Ask an admin to review your access.",
	"no-supported-scopes":
		"Your Autumn role doesn't include any permissions the Slack bot can use. Ask an admin to adjust your access.",
};

export type SlackUserAuthResult =
	| { ok: true; userId: string; role: string; scopes: string[] }
	| { ok: false; reason: SlackAuthDenyReason; text: string };

export const OAUTH_CEILING = new Set<string>(DEFAULT_OAUTH_RESOURCE_SCOPES);
