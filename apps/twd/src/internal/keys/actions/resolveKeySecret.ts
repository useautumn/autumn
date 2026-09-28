import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { peekKeySecret } from "../keySecrets.ts";
import { syncKeys } from "./syncKeys.ts";

/** Secret for a platform account; re-syncs stored keys once when it isn't cached (e.g. after boot). */
export const resolveKeySecret = async ({
	ctx,
	platformAccountId,
}: {
	ctx: TwdContext;
	platformAccountId: string;
}): Promise<string> => {
	const cached = peekKeySecret({ platformAccountId });
	if (cached) return cached;
	await syncKeys({ ctx });
	const secret = peekKeySecret({ platformAccountId });
	if (secret) return secret;
	throw new TwdError({
		status: 409,
		code: "key_missing",
		message: `No stored key resolves to platform account ${platformAccountId}.`,
		next: "POST /keys/probe to refresh keys, then retry.",
		escalate: `Ask a twd admin to re-import the key for ${platformAccountId} on the Stripe keys page.`,
		details: { platformAccountId },
	});
};
