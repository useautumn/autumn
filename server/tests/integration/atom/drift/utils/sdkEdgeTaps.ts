import { LATEST_VERSION } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { HTTPClient } from "../../../../../../packages/sdk/src/lib/http.js";
import { Autumn } from "../../../../../../packages/sdk/src/sdk/sdk.js";
import { atomTestClient } from "../../utils/atomTestClient.js";
import type { TestAtom } from "../../utils/ensureAtomDeployment.js";

/** One request a tap passed on: where it went, what came back, and whether the Atom forwarded it. */
export type TapSeen = {
	path: string;
	status: number;
	key: string | null;
	forwarded: string | null;
};

/** Passes every request on to `targetUrl`, with `headers` over its own, recording each one as it is answered. */
const startTap = ({
	targetUrl,
	headers = {},
}: {
	targetUrl: string;
	headers?: Record<string, string>;
}) => {
	const seen: TapSeen[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		idleTimeout: 0,
		async fetch(request) {
			const body = await request.arrayBuffer();
			const sent = new Headers(request.headers);
			sent.delete("host");
			for (const [name, value] of Object.entries(headers))
				sent.set(name, value);
			const { pathname, search } = new URL(request.url);
			const reply = await fetch(`${targetUrl}${pathname}${search}`, {
				method: request.method,
				headers: sent,
				body,
			});
			const text = await reply.text();
			const forwarded = reply.headers.get("x-atom-forwarded");
			seen.push({
				path: pathname,
				status: reply.status,
				key: sent.get("idempotency-key"),
				forwarded,
			});
			const replied = new Headers({ "content-type": "application/json" });
			if (forwarded) replied.set("x-atom-forwarded", forwarded);
			return new Response(text, { status: reply.status, headers: replied });
		},
	});
	return {
		url: `http://127.0.0.1:${server.port}`,
		seen,
		stop: () => server.stop(true),
	};
};

/** The generated SDK's finalize has no `customer_id` yet (2.6 requires it), so it is added on the wire. */
const namingCustomer = ({ customerId }: { customerId: string }) =>
	new HTTPClient({
		fetcher: async (input, init) => {
			const request = new Request(input, init);
			if (!request.url.endsWith("/v1/balances.finalize")) return fetch(request);
			const body = { ...(await request.json()), customer_id: customerId };
			return fetch(new Request(request, { body: JSON.stringify(body) }));
		},
	});

/** The SDK under `useEdge`, its edge and API calls each passing through a tap. */
export const sdkThroughEdgeTaps = ({
	atom,
	customerId,
}: {
	atom: TestAtom;
	customerId: string;
}) => {
	const edge = startTap({
		targetUrl: atom.endpointUrl,
		headers: { "x-atom-token": atom.token },
	});
	const api = startTap({
		targetUrl: atomTestClient().baseUrl.replace(/\/v1$/, ""),
	});
	const sdk = new Autumn({
		secretKey: defaultCtx.orgSecretKey,
		serverURL: api.url,
		edgeURL: edge.url,
		useEdge: true,
		retryConfig: { strategy: "none" },
		xApiVersion: LATEST_VERSION,
		failOpen: false,
		httpClient: namingCustomer({ customerId }),
	});
	return {
		sdk,
		edge,
		api,
		stop: () => {
			edge.stop();
			api.stop();
		},
	};
};
