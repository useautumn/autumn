import * as crypto from "node:crypto";

/**
 * Hash OAuth token using SHA-256 + base64url encoding.
 * This matches better-auth's default token hashing method.
 */
export async function hashOAuthToken(token: string): Promise<string> {
	const hash = crypto.createHash("sha256").update(token).digest();
	// Convert to base64url (replace +/= with -_)
	return hash
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}
