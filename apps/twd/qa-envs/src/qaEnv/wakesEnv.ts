const BOT_UA =
	/bot|crawl|spider|scan|slurp|curl|wget|python|go-http|httpx|zgrab|masscan|nmap|censys|shodan|expanse|headless/i;

const isBrowserPageLoad = (req: Request) => {
	const userAgent = req.headers.get("user-agent") ?? "";
	return (
		req.method === "GET" &&
		(req.headers.get("accept") ?? "").includes("text/html") &&
		userAgent.includes("Mozilla") &&
		!BOT_UA.test(userAgent)
	);
};

/** A sleeping env starts only for a person's page load or its own waking page; scanners get a 503. */
export const wakesEnv = ({ req, url }: { req: Request; url: URL }) =>
	req.headers.get("sec-fetch-mode") === "navigate" ||
	isBrowserPageLoad(req) ||
	url.pathname === "/__qa_wake_status" ||
	url.pathname === "/__qa_progress";

export const describeRequest = ({ req, url }: { req: Request; url: URL }) => ({
	at: Date.now(),
	method: req.method,
	path: url.pathname,
	userAgent: req.headers.get("user-agent")?.slice(0, 160),
	accept: req.headers.get("accept")?.slice(0, 80),
	secFetchMode: req.headers.get("sec-fetch-mode"),
	country: (req.cf as { country?: string } | undefined)?.country,
});
