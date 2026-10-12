import { describe, expect, test } from "bun:test";
import {
	PEER_RELAYED_HEADER,
	PEER_SIGNATURE_HEADER,
	peerRequestHeaders,
	peerSignatureMatches,
	signPeerRequest,
} from "../../../src/replication/transport/peerSignature.js";

const SECRET = "s".repeat(64);
const request = {
	method: "POST",
	path: "/v1/subjects.set",
	customerId: "cus_1",
	body: "{}",
};

describe("a request between replicas", () => {
	test("is signed with the deployment's secret over its method, path, customer and body; only that signature matches", () => {
		const signature = signPeerRequest({ secret: SECRET, ...request });

		expect(
			peerSignatureMatches({ secret: SECRET, signature, ...request }),
		).toBe(true);
		expect(
			peerSignatureMatches({
				secret: SECRET,
				signature,
				...request,
				body: "{ }",
			}),
		).toBe(false);
		expect(
			peerSignatureMatches({
				secret: SECRET,
				signature,
				...request,
				path: "/v1/_peer/subjects.since",
			}),
		).toBe(false);
		expect(
			peerSignatureMatches({
				secret: SECRET,
				signature,
				...request,
				customerId: "cus_2",
			}),
		).toBe(false);
		expect(
			peerSignatureMatches({
				secret: SECRET,
				signature,
				...request,
				method: "PUT",
			}),
		).toBe(false);
		expect(
			peerSignatureMatches({ secret: "t".repeat(64), signature, ...request }),
		).toBe(false);
		expect(
			peerSignatureMatches({ secret: SECRET, signature: "zz", ...request }),
		).toBe(false);
		expect(
			peerSignatureMatches({ secret: SECRET, signature: "", ...request }),
		).toBe(false);
	});

	test("carries its signature and the relayed mark over the kind's own headers", () => {
		const headers = peerRequestHeaders({
			secret: SECRET,
			...request,
			headers: { "x-atom-customer-id": "cus_1" },
		});

		expect(headers).toEqual({
			"content-type": "application/json",
			"x-atom-customer-id": "cus_1",
			[PEER_SIGNATURE_HEADER]: signPeerRequest({ secret: SECRET, ...request }),
			[PEER_RELAYED_HEADER]: "1",
		});
	});
});
