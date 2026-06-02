import crypto from "node:crypto";
import { isFuture } from "date-fns";
import { z } from "zod";
import { AppEnv } from "../models/genModels/genEnums.js";

const chatInstallStateSchema = z.strictObject({
	provider: z.enum(["slack", "discord"]),
	orgId: z.string(),
	userId: z.string(),
	env: z.nativeEnum(AppEnv),
	expiresAt: z.number(),
	nonce: z.string(),
});

export type ChatInstallState = z.infer<typeof chatInstallStateSchema>;

const encode = (value: unknown) =>
	Buffer.from(JSON.stringify(value)).toString("base64url");

const sign = (payload: string, secret: string) =>
	crypto.createHmac("sha256", secret).update(payload).digest("base64url");

export const createChatInstallState = ({
	secret,
	...state
}: ChatInstallState & { secret: string }) => {
	const payload = encode(state);
	return `${payload}.${sign(payload, secret)}`;
};

export const verifyChatInstallState = (state: string, secret: string) => {
	const [payload, signature] = state.split(".");
	if (!payload || !signature) return null;

	const expected = Buffer.from(sign(payload, secret));
	const actual = Buffer.from(signature);
	if (
		expected.length !== actual.length ||
		!crypto.timingSafeEqual(expected, actual)
	)
		return null;

	try {
		const parsed = chatInstallStateSchema.parse(
			JSON.parse(Buffer.from(payload, "base64url").toString()),
		);
		return isFuture(parsed.expiresAt) ? parsed : null;
	} catch {
		return null;
	}
};
