import { createServer } from "node:http";

const LOG_PREFIX = "[tw-ingress]";
const DEFAULT_PORT = 8080;

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_BAD_GATEWAY = 502;

const port = Number(process.env.INGRESS_PORT) || DEFAULT_PORT;
const token = process.env.INGRESS_TOKEN ?? "";
const defaultEnv = process.env.TW_ENV ?? "sandbox";

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

const forwardConnectEvent = async ({ rawBody, env }) => {
	let event;
	try {
		event = JSON.parse(rawBody);
	} catch (error) {
		logWarn(`dropping connect event with unparseable body: ${error.message}`);
		return HTTP_BAD_REQUEST;
	}

	const accountId = event?.account;
	if (!accountId) {
		logWarn("dropping connect event with no event.account");
		return HTTP_BAD_REQUEST;
	}

	const workerUrl = routes.get(accountId);
	if (!workerUrl) {
		// Silently drop: after teardown, Stripe retries webhooks for deleted
		return HTTP_OK;
	}

	const target = `${workerUrl}/webhooks/connect/${env}`;
	const startedAt = Date.now();
	const description = `event=${event.id} type=${event.type} account=${accountId}`;
	try {
		const response = await fetch(target, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: rawBody,
			redirect: "manual",
		});
		await response.text();
		const outcome = `${description} status=${response.status} elapsedMs=${Date.now() - startedAt}`;
		if (!response.ok) {
			logWarn(`forward failed: ${outcome}`);
		} else {
			logInfo(`forward acknowledged: ${outcome}`);
		}
		return response.status;
	} catch (error) {
		logError(
			`forward failed: ${description} elapsedMs=${Date.now() - startedAt} error=${error.message}`,
		);
		return HTTP_BAD_GATEWAY;
	}
};

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

	const { accountId, workerUrl, workerAccountId, map } = payload;
	if (accountId && workerAccountId) {
		const ownerUrl = routes.get(workerAccountId);
		if (!ownerUrl) {
			sendJson(res, HTTP_BAD_REQUEST, {
				error: "worker account is not registered",
			});
			return;
		}
		const existingUrl = routes.get(accountId);
		if (existingUrl && existingUrl !== ownerUrl) {
			sendJson(res, 409, {
				error: "account already belongs to another worker",
			});
			return;
		}
		routes.set(accountId, ownerUrl);
		logInfo(
			`mapped sub-organization account ${accountId} to worker ${workerAccountId}`,
		);
		sendJson(res, HTTP_OK, { size: routes.size });
		return;
	}
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

const handleMapRead = (res) => {
	sendJson(res, HTTP_OK, {
		map: Object.fromEntries(routes),
		size: routes.size,
	});
};

const handleConnect = async (req, res, env) => {
	const rawBody = await readBody(req);
	const status = await forwardConnectEvent({ rawBody, env });
	sendText(res, status, status < 300 ? "ok" : "webhook delivery failed");
};

export const server = createServer((req, res) => {
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
				const rest = path.slice("/ingress/connect".length).replace(/^\//, "");
				const env = rest || defaultEnv;
				await handleConnect(req, res, env);
				return;
			}

			sendText(res, HTTP_NOT_FOUND, "not found");
		} catch (error) {
			logError(`request handler error: ${error.message}`);
			if (!res.headersSent) {
				sendText(res, HTTP_INTERNAL_SERVER_ERROR, "ingress request failed");
			}
		}
	})();
});

if (import.meta.main) {
	server.listen(port, () => {
		logInfo(`listening on :${port} (env=${defaultEnv})`);
	});
}
