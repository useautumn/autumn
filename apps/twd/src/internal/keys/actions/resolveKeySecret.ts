import { eq } from "drizzle-orm";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { TwdError } from "../../../http/apiError.ts";
import { openSecret } from "../../../lib/secretBox.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { peekKeySecret, rememberKeySecret } from "../keySecrets.ts";
import { syncKeys } from "./syncKeys.ts";

/** Local decrypt of the stored key; no Stripe calls, so a cold cache after a deploy costs one query. */
const loadStoredSecret = async ({
	ctx,
	platformAccountId,
}: {
	ctx: TwdContext;
	platformAccountId: string;
}) => {
	const [row] = await ctx.db
		.select({ sealed: stripeKeys.secretCiphertext })
		.from(stripeKeys)
		.where(eq(stripeKeys.platformAccountId, platformAccountId));
	if (!row?.sealed) return undefined;
	const secret = openSecret({ sealed: row.sealed });
	rememberKeySecret({ platformAccountId, secret });
	return secret;
};

/** Secret for a platform account: memory, then the encrypted DB copy, then (last resort) a full key re-probe. */
export const resolveKeySecret = async ({
	ctx,
	platformAccountId,
}: {
	ctx: TwdContext;
	platformAccountId: string;
}): Promise<string> => {
	const cached =
		peekKeySecret({ platformAccountId }) ??
		(await loadStoredSecret({ ctx, platformAccountId }));
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
