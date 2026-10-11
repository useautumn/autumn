import { describe, expect, test } from "bun:test";
import {
	PEER_RELAYED_HEADER,
	PEER_SIGNATURE_HEADER,
	peerRequestHeaders,
	peerSignatureMatches,
	signPeerBody,
} from "../../../src/replication/transport/peerSignature.js";

const TOKEN_HASH = "a".repeat(64);

describe("a request between replicas", () => {
	test("is signed with the token hash over its body, and only that signature matches", () => {
		const signature = signPeerBody({ tokenHash: TOKEN_HASH, body: "{}" });

		expect(
			peerSignatureMatches({ tokenHash: TOKEN_HASH, body: "{}", signature }),
		).toBe(true);
		expect(
			peerSignatureMatches({ tokenHash: TOKEN_HASH, body: "{ }", signature }),
		).toBe(false);
		expect(
			peerSignatureMatches({
				tokenHash: "b".repeat(64),
				body: "{}",
				signature,
			}),
		).toBe(false);
		expect(
			peerSignatureMatches({
				tokenHash: TOKEN_HASH,
				body: "{}",
				signature: "zz",
			}),
		).toBe(false);
		expect(
			peerSignatureMatches({
				tokenHash: TOKEN_HASH,
				body: "{}",
				signature: "",
			}),
		).toBe(false);
	});

	test("carries its signature and the relayed mark over the kind's own headers", () => {
		const headers = peerRequestHeaders({
			tokenHash: TOKEN_HASH,
			body: "{}",
			headers: { "x-atom-customer-id": "cus_1" },
		});

		expect(headers).toEqual({
			"content-type": "application/json",
			"x-atom-customer-id": "cus_1",
			[PEER_SIGNATURE_HEADER]: signPeerBody({
				tokenHash: TOKEN_HASH,
				body: "{}",
			}),
			[PEER_RELAYED_HEADER]: "1",
		});
	});
});
