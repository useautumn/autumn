import { and, eq } from "drizzle-orm";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { forgetKeySecretsExcept, knownKeySecrets } from "../keySecrets.ts";

/** Drops the stored secret and takes the key out of rotation. Stripe itself is untouched. */
export const removeKey = async ({
	ctx,
	platformAccountId,
}: {
	ctx: TwdContext;
	platformAccountId: string;
}) => {
	const inUse = await ctx.db
		.select({ id: stripeAccounts.id })
		.from(stripeAccounts)
		.where(
			and(
				eq(stripeAccounts.platformAccountId, platformAccountId),
				eq(stripeAccounts.state, "in_use"),
			),
		);
	if (inUse.length > 0)
		throw new TwdError({
			status: 409,
			code: "key_busy",
			message: `${inUse.length} accounts on ${platformAccountId} are in use by runs.`,
			next: "Wait for those runs to finish, then remove the key.",
		});
	const [removed] = await ctx.db
		.update(stripeKeys)
		.set({
			secretCiphertext: null,
			present: false,
			usable: false,
			unusableReason: "removed from twd",
			updatedAt: new Date(),
		})
		.where(eq(stripeKeys.platformAccountId, platformAccountId))
		.returning({ platformAccountId: stripeKeys.platformAccountId });
	if (!removed)
		throw new TwdError({
			status: 404,
			code: "unknown_key",
			message: `No key for platform account ${platformAccountId}.`,
			next: "GET /api/keys lists keys and their platform accounts.",
		});
	forgetKeySecretsExcept({
		platformAccountIds: new Set(
			knownKeySecrets()
				.map((key) => key.platformAccountId)
				.filter((id) => id !== platformAccountId),
		),
	});
	return removed;
};
