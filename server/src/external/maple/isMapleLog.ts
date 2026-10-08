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

	// A query param named `name` can serialize the same marker ahead of req.name, so check every hit.
	let markerIndex = line.indexOf(BILLING_ROUTE_MARKER);
	while (markerIndex !== -1) {
		const pathStart = markerIndex + BILLING_ROUTE_MARKER.length;
		for (const path of BILLING_PATHS) {
			if (line.startsWith(path, pathStart)) return true;
		}
		markerIndex = line.indexOf(BILLING_ROUTE_MARKER, pathStart);
	}
	return false;
};
