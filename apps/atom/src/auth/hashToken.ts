import { createHash } from "node:crypto";

/** Only a token's SHA-256 is ever kept or compared; the token itself stays with whoever holds it. */
export const hashToken = ({ token }: { token: string }): string =>
	createHash("sha256").update(token).digest("hex");
