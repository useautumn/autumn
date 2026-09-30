import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import { TwdError } from "../http/apiError.ts";
import { getTwdEnv } from "./env.ts";

const encryptionKey = () => {
	const secret = getTwdEnv().TWD_KEY_ENCRYPTION_SECRET;
	if (!secret)
		throw new TwdError({
			status: 503,
			code: "key_encryption_unset",
			message:
				"TWD_KEY_ENCRYPTION_SECRET is not set, so twd can't store Stripe keys.",
			next: "Set TWD_KEY_ENCRYPTION_SECRET on the twd service and redeploy.",
			escalate: "Ask a twd admin to set TWD_KEY_ENCRYPTION_SECRET.",
		});
	return createHash("sha256").update(secret).digest();
};

/** `iv.tag.ciphertext`, base64url. */
export const sealSecret = ({ plaintext }: { plaintext: string }) => {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
	const body = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	return [iv, cipher.getAuthTag(), body]
		.map((part) => part.toString("base64url"))
		.join(".");
};

export const openSecret = ({ sealed }: { sealed: string }) => {
	const [iv, tag, body] = sealed
		.split(".")
		.map((part) => Buffer.from(part, "base64url"));
	const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(body), decipher.final()]).toString(
		"utf8",
	);
};
