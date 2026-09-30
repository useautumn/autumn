export type KafkaTokenInfo = {
	/** Last characters of the access key the token was signed with; null when the token could not be read. */
	keyIdSuffix: string | null;
	signedAt: string | null;
	/** When the broker stops accepting the token, as the signer reported it. */
	expiresAt: string;
	ttlSeconds: number | null;
};

const KEY_ID_SUFFIX_LENGTH = 5;

/** Reads the signing key and lifetime out of an MSK IAM token: a presigned URL, base64url-encoded, whose
 *  query carries the credential scope. Never throws: a token it cannot read still names its expiry. */
export function describeMskToken({
	token,
	expiryTime,
}: {
	token: string;
	expiryTime: number;
}): KafkaTokenInfo {
	const expiresAt = new Date(expiryTime).toISOString();
	try {
		const url = new URL(Buffer.from(token, "base64url").toString("utf8"));
		const credential = url.searchParams.get("X-Amz-Credential") ?? "";
		const keyId = credential.split("/")[0] ?? "";
		const signed = url.searchParams.get("X-Amz-Date");
		const expires = Number(url.searchParams.get("X-Amz-Expires"));
		return {
			keyIdSuffix: keyId ? keyId.slice(-KEY_ID_SUFFIX_LENGTH) : null,
			signedAt: signed ? amzDateToIso(signed) : null,
			expiresAt,
			ttlSeconds: Number.isFinite(expires) && expires > 0 ? expires : null,
		};
	} catch {
		return { keyIdSuffix: null, signedAt: null, expiresAt, ttlSeconds: null };
	}
}

/** `20260930T063900Z` as the signer writes it. */
function amzDateToIso(value: string): string | null {
	const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
	if (!match) return null;
	const [, year, month, day, hour, minute, second] = match;
	return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}
