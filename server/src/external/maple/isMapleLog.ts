const STRIPE_WEBHOOK_MARKER = '"stripe_event":{';
// The first " /v1/" in a request line is `req.name` ("POST /v1/billing.attach").
const API_PATH_MARKER = " /v1/";
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

	const markerIndex = line.indexOf(API_PATH_MARKER);
	if (markerIndex === -1) return false;

	const pathStart = markerIndex + API_PATH_MARKER.length;
	for (const path of BILLING_PATHS) {
		if (line.startsWith(path, pathStart)) return true;
	}
	return false;
};
