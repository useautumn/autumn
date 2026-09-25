/** Vercel events are published to the org's Vercel Svix app, the rest to its main app. */
export type WebhookAppKind = "main" | "vercel";

export const isVercelEvent = (event: string): boolean =>
	event.startsWith("vercel.");

/** Which app a webhook with these events lives in; mixed lists are refused upstream. */
export const webhookAppKindOf = ({
	events,
}: {
	events: readonly string[];
}): WebhookAppKind =>
	events.length > 0 && events.every(isVercelEvent) ? "vercel" : "main";

export const WEBHOOK_APP_SWITCH_MESSAGE =
	"A webhook can't switch between Vercel events and other events; make a new webhook instead";
