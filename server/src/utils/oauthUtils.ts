import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";

/**
 * Hash OAuth token using SHA-256 + base64url encoding.
 * This matches better-auth's default token hashing method.
 */
export async function hashOAuthToken(token: string): Promise<string> {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(token),
	);
	return base64Url.encode(new Uint8Array(hash as ArrayBuffer), {
		padding: false,
	});
}
