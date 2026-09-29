import { createHmac, timingSafeEqual } from "node:crypto";

export function signProxyBody({
	secret,
	rawBody,
}: {
	secret: string;
	rawBody: string;
}): string {
	return `v1=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function signaturesMatch({
	expected,
	received,
}: {
	expected: string;
	received: string;
}): boolean {
	const expectedBytes = Buffer.from(expected);
	const receivedBytes = Buffer.from(received);
	return (
		expectedBytes.length === receivedBytes.length &&
		timingSafeEqual(expectedBytes, receivedBytes)
	);
}

export function isSignedBySecret({
	secret,
	rawBody,
	signature,
}: {
	secret: string;
	rawBody: string;
	signature: string | null;
}): boolean {
	if (!signature) return false;
	const expected = signProxyBody({ secret, rawBody });
	return signaturesMatch({ expected, received: signature });
}
