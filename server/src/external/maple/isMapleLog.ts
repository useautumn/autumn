const STRIPE_WEBHOOK_MARKER = '"stripe_event":{';
// Every billing route is a POST, and JSON escaping keeps this sequence out of string values.
const BILLING_ROUTE_MARKER = '"name":"POST /v1/';
const BILLING_PATHS = [
	"billing",
	"attach",
	"cancel",
	"checkout",
	"setup_payment",
];

/** Runs on every log line, so non-matching lines cost a substring scan and nothing else. */
export const isMapleLog = (line: string) => {
	if (line.includes(STRIPE_WEBHOOK_MARKER)) return true;

	const markerIndex = line.indexOf(BILLING_ROUTE_MARKER);
	if (markerIndex === -1) return false;

	const pathStart = markerIndex + BILLING_ROUTE_MARKER.length;
	for (const path of BILLING_PATHS) {
		if (line.startsWith(path, pathStart)) return true;
	}
	return false;
};
