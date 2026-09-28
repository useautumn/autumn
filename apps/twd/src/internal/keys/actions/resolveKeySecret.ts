import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { peekKeySecret } from "../keySecrets.ts";
import { syncKeysFromEnv } from "./syncKeysFromEnv.ts";

/** Secret for a platform account; re-syncs TW_V3_KEYS once when it isn't cached (e.g. after boot). */
export const resolveKeySecret = async ({
	ctx,
	platformAccountId,
}: {
	ctx: TwdContext;
	platformAccountId: string;
}): Promise<string> => {
	const cached = peekKeySecret({ platformAccountId });
	if (cached) return cached;
	await syncKeysFromEnv({ ctx });
	const secret = peekKeySecret({ platformAccountId });
	if (secret) return secret;
	throw new TwdError({
		status: 409,
		code: "key_missing",
		message: `No TW_V3_KEYS secret resolves to platform account ${platformAccountId}.`,
		next: "POST /keys/probe to refresh keys, then retry.",
		escalate: `Ask a twd admin to add the key for ${platformAccountId} back to TW_V3_KEYS.`,
		details: { platformAccountId },
	});
};
