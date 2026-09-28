/** Svix's own endpoint id: `ep_` and a 27-character KSUID. */
const SVIX_ENDPOINT_ID = /^ep_[0-9A-Za-z]{27}$/;

/**
 * A webhook made in the dashboard has no id of ours, so the API lists it under
 * Svix's endpoint id. A config never manages one.
 */
export const isDashboardWebhook = ({ id }: { id: string }): boolean =>
	SVIX_ENDPOINT_ID.test(id);
