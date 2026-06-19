/**
 * Stripe Connect webhook INGRESS for `bun tw` (plan §6a / §9 / §9a).
 *
 * Stripe caps webhook endpoints at 16/account, so the per-worker Connect-webhook
 * model tops out at ~16 workers. This ingress replaces it: the orchestrator
 * registers ONE shared platform Connect webhook pointed here, and this server
 * fans each event to exactly the owning worker by `event.account` — full
 * per-worker delivery isolation AND no 16-worker cap.
 *
 * It is a self-contained Node ESM http server using only built-ins (`node:http`,
 * the global `fetch`/`URL`, available in node24). It runs in its own lightweight
 * ingress sandbox (no build-base — it only runs this http server) launched
 * detached by the orchestrator (scripts/tw/helpers/ingress.ts).
 *
 * Env:
 *   - INGRESS_PORT  — the port to listen on (default 8080).
 *   - INGRESS_TOKEN — shared secret the orchestrator authenticates map writes with.
 *   - TW_ENV        — the env path segment for the forwarded connect route
 *                     (`/webhooks/connect/<env>`); default "sandbox".
 *
 * Routes:
 *   - GET  /health               → 200 "ok".
 *   - POST /ingress/map          → token-authed; merge `{ accountId, workerUrl }`
 *                                  and/or `{ map: { [acct]: url } }`; → `{ size }`.
 *   - GET  /ingress/map          → the current map as JSON (debug).
 *   - POST /ingress/connect[/:env] → ack 200 immediately, then async forward the
 *                                  raw body to the owning worker's connect route.
 *   - 404 otherwise.
 */

import { createServer } from "node:http";

const LOG_PREFIX = "[tw-ingress]";
const DEFAULT_PORT = 8080;

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

const port = Number(process.env.INGRESS_PORT) || DEFAULT_PORT;
const token = process.env.INGRESS_TOKEN ?? "";
const defaultEnv = process.env.TW_ENV ?? "sandbox";

/** In-memory routing table: Stripe connected account id → worker public URL. */
const routes = new Map();

const logInfo = (message) => {
	console.log(`${LOG_PREFIX} ${message}`);
};

const logWarn = (message) => {
	console.warn(`${LOG_PREFIX} ${message}`);
};

const logError = (message) => {
	console.error(`${LOG_PREFIX} ${message}`);
};

/** Read a request's raw body as a UTF-8 string. */
const readBody = (req) =>
	new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});

const sendJson = (res, status, payload) => {
	const body = JSON.stringify(payload);
	res.writeHead(status, { "content-type": "application/json" });
	res.end(body);
};

const sendText = (res, status, text) => {
	res.writeHead(status, { "content-type": "text/plain" });
	res.end(text);
};

/**
 * Forward an already-acked connect event to the owning worker. Never throws —
 * Stripe has already received its 200, so a forward failure is logged and dropped
 * rather than propagated.
 */
const forwardConnectEvent = async (rawBody, env) => {
	let accountId;
	try {
		const event = JSON.parse(rawBody);
		accountId = event?.account;
	} catch (error) {
		logWarn(`dropping connect event with unparseable body: ${error.message}`);
		return;
	}

	if (!accountId) {
		logWarn("dropping connect event with no event.account");
		return;
	}

	const workerUrl = routes.get(accountId);
	if (!workerUrl) {
		// Silently drop: after teardown, Stripe retries webhooks for deleted
		// sub-accounts for a while — there's no worker to route them to and it's
		// expected, so logging each one just spams the run output.
		return;
	}

	const target = `${workerUrl}/webhooks/connect/${env}`;
	try {
		const response = await fetch(target, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: rawBody,
		});
		if (!response.ok) {
			logWarn(
				`forward to ${target} (account ${accountId}) returned ${response.status}`,
			);
		}
	} catch (error) {
		logError(
			`forward to ${target} (account ${accountId}) failed: ${error.message}`,
		);
	}
};

/** POST /ingress/map — token-authed map write (single and/or bulk). */
const handleMapWrite = async (req, res) => {
	if (req.headers["x-ingress-token"] !== token) {
		sendJson(res, HTTP_UNAUTHORIZED, { error: "invalid ingress token" });
		return;
	}

	let payload;
	try {
		const raw = await readBody(req);
		payload = raw ? JSON.parse(raw) : {};
	} catch (error) {
		sendJson(res, HTTP_BAD_REQUEST, {
			error: `invalid JSON: ${error.message}`,
		});
		return;
	}

	const { accountId, workerUrl, map } = payload;
	if (accountId && workerUrl) {
		routes.set(accountId, workerUrl);
		logInfo(`mapped account ${accountId} → ${workerUrl}`);
	}
	if (map && typeof map === "object") {
		for (const [account, url] of Object.entries(map)) {
			routes.set(account, url);
			logInfo(`mapped account ${account} → ${url}`);
		}
	}

	sendJson(res, HTTP_OK, { size: routes.size });
};

/** GET /ingress/map — dump the current routing table (debug). */
const handleMapRead = (res) => {
	sendJson(res, HTTP_OK, {
		map: Object.fromEntries(routes),
		size: routes.size,
	});
};

/**
 * POST /ingress/connect[/:env] — ack Stripe immediately (it needs a fast 200),
 * then forward to the owning worker async. The optional `:env` path segment wins
 * over `TW_ENV`.
 */
const handleConnect = async (req, res, env) => {
	const rawBody = await readBody(req);
	// Ack Stripe FIRST — it must always get a fast 200, even if we have no route.
	sendText(res, HTTP_OK, "ok");
	// Forward async; never throws.
	void forwardConnectEvent(rawBody, env);
};

const server = createServer((req, res) => {
	void (async () => {
		try {
			const url = new URL(req.url ?? "/", `http://localhost:${port}`);
			const path = url.pathname;
			const method = req.method ?? "GET";

			if (method === "GET" && path === "/health") {
				sendText(res, HTTP_OK, "ok");
				return;
			}

			if (method === "POST" && path === "/ingress/map") {
				await handleMapWrite(req, res);
				return;
			}

			if (method === "GET" && path === "/ingress/map") {
				handleMapRead(res);
				return;
			}

			if (method === "POST" && path.startsWith("/ingress/connect")) {
				// `/ingress/connect/<env>` → use the segment; bare `/ingress/connect`
				// → fall back to TW_ENV.
				const rest = path.slice("/ingress/connect".length).replace(/^\//, "");
				const env = rest || defaultEnv;
				await handleConnect(req, res, env);
				return;
			}

			sendText(res, HTTP_NOT_FOUND, "not found");
		} catch (error) {
			logError(`request handler error: ${error.message}`);
			if (!res.headersSent) {
				sendText(res, HTTP_OK, "ok");
			}
		}
	})();
});

server.listen(port, () => {
	logInfo(`listening on :${port} (env=${defaultEnv})`);
});
