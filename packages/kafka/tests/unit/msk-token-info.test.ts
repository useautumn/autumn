import { expect, test } from "bun:test";
import { describeMskToken } from "../../src/client/mskTokenInfo.js";

/** What the MSK IAM signer hands kafkajs: a presigned URL, base64url-encoded, whose query names the key it was signed with. */
function fakeToken({
	keyId,
	date,
	expires,
}: {
	keyId: string;
	date: string;
	expires: number;
}): string {
	const url = new URL("https://kafka.us-east-2.amazonaws.com/");
	url.searchParams.set("Action", "kafka-cluster:Connect");
	url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
	url.searchParams.set(
		"X-Amz-Credential",
		`${keyId}/20260930/us-east-2/kafka-cluster/aws4_request`,
	);
	url.searchParams.set("X-Amz-Date", date);
	url.searchParams.set("X-Amz-Expires", String(expires));
	url.searchParams.set("X-Amz-Signature", "deadbeef");
	return Buffer.from(url.href).toString("base64url");
}

test("names the signing key by its last four characters and the moment the token stops working", () => {
	const token = fakeToken({
		keyId: "ASIAXXXXXXXXXXXA1B2C",
		date: "20260930T063900Z",
		expires: 900,
	});
	expect(describeMskToken({ token, expiryTime: 1_790_751_240_000 })).toEqual({
		keyIdSuffix: "A1B2C",
		signedAt: "2026-09-30T06:39:00.000Z",
		expiresAt: "2026-09-30T06:54:00.000Z",
		ttlSeconds: 900,
	});
});

test("a token it cannot read still reports what the signer said about expiry", () => {
	expect(
		describeMskToken({ token: "%%%", expiryTime: 1_790_751_240_000 }),
	).toEqual({
		keyIdSuffix: null,
		signedAt: null,
		expiresAt: "2026-09-30T06:54:00.000Z",
		ttlSeconds: null,
	});
});
