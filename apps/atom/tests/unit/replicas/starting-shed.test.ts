/**
 * A replica whose public port opened before its /health is 200 (n-stack rig matrix, sendBeforeReady: 17 × 503
 * atom_overloaded from the starting replica's thread 0 in the second its port opened, while its ready peer could answer).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { LATEST_VERSION } from "@autumn/shared";
import { MAX_LOOP_LAG_MS } from "../../../src/http/middlewares/admissionMiddleware.js";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	storeOnly,
} from "../replication/replicaFixtures.js";

afterEach(() => {
	disconnect();
	cleanUpReplicas();
});

const A = "10.0.0.1";
const B = "10.0.0.2";

describe("a starting replica whose loop is behind while it catches up", () => {
	test("rig red: hands a public check to its ready peer (x-atom-proxied starting) instead of shedding it with a 503", async () => {
		const a = createReplica({ address: A, peers: [B] });
		const b = createReplica({
			address: B,
			peers: [A],
			ready: false,
			loop: { lagMs: () => MAX_LOOP_LAG_MS * 5 },
		});
		await storeOnly({ replica: a, customerId: "cus_1", readAt: 1700 });
		connect({ replicas: [a, b] });

		const reply = await b.app.request("/v1/balances.check", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: "Bearer am_sk_test_1",
				"x-atom-token": ATOM_TOKEN,
				"x-api-version": LATEST_VERSION,
			},
			body: JSON.stringify({ customer_id: "cus_1", feature_id: "messages" }),
		});

		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-proxied")).toBe("starting");
	});
});
