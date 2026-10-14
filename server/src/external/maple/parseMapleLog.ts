const STRIPE_WEBHOOK_MARKER = '"stripe_event":{';
// Every billing route is a POST.
const BILLING_ROUTE_PREFIX = "POST /v1/";
const BILLING_ROUTE_MARKER = `"name":"${BILLING_ROUTE_PREFIX}`;
export const BILLING_PATHS = [
	"billing",
	"attach",
	"cancel",
	"checkout",
	"setup_payment",
];

export type PinoLogLine = {
	msg?: string;
	level?: string;
	time?: number;
	stripe_event?: unknown;
	req?: { name?: unknown };
	[key: string]: unknown;
};

// Positional on purpose: it runs per marker hit on the hot path, so no argument object.
const startsWithBillingPath = (text: string, pathStart: number) => {
	for (const path of BILLING_PATHS) {
		if (text.startsWith(path, pathStart)) return true;
	}
	return false;
};

/** Substring scan that never misses a Maple line; request data can forge a hit, so hits are confirmed after parsing. */
const mightBeMapleLog = (line: string) => {
	if (line.includes(STRIPE_WEBHOOK_MARKER)) return true;

	let markerIndex = line.indexOf(BILLING_ROUTE_MARKER);
	while (markerIndex !== -1) {
		const pathStart = markerIndex + BILLING_ROUTE_MARKER.length;
		if (startsWithBillingPath(line, pathStart)) return true;
		markerIndex = line.indexOf(BILLING_ROUTE_MARKER, pathStart);
	}
	return false;
};

/** Returns the parsed line for billing requests (top-level `req.name`) and Stripe webhooks; other lines are never parsed. */
export const parseMapleLog = (line: string): PinoLogLine | null => {
	if (!mightBeMapleLog(line)) return null;

	const record: PinoLogLine = JSON.parse(line);
	if (record.stripe_event) return record;

	const name = record.req?.name;
	if (typeof name !== "string" || !name.startsWith(BILLING_ROUTE_PREFIX)) {
		return null;
	}
	return startsWithBillingPath(name, BILLING_ROUTE_PREFIX.length)
		? record
		: null;
};
