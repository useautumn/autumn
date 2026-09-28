import { stripeMetadata } from "@tw/helpers/owner.ts";
import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import { and, count, eq, ne } from "drizzle-orm";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { ACCOUNTS_PER_KEY_CAP } from "../../accounts/allocator/poolLimits.ts";
import { stripeForKey } from "../stripeForKey.ts";
import { resolveKeySecret } from "./resolveKeySecret.ts";
import { twdPoolMetadata } from "./setTwdPoolState.ts";

const POOL_ORG_NAME = "Unit Test Org (twd pool)";
const POOL_ORG_ID = "twd_pool";

/** Same v2 create body as scripts/tw createSandboxSubAccount (that one pulls the server graph).
 * Tops every usable key (or just `platformAccountId`, locked or not) up to `targetPerKey` non-broken
 * accounts, never past ACCOUNTS_PER_KEY_CAP. */
export const topUpAccounts = async ({
	ctx,
	targetPerKey,
	platformAccountId: onlyKey,
}: {
	ctx: TwdContext;
	targetPerKey: number;
	platformAccountId?: string;
}): Promise<{ created: number }> => {
	const keys = await ctx.db
		.select({ platformAccountId: stripeKeys.platformAccountId })
		.from(stripeKeys)
		.where(
			onlyKey
				? and(
						eq(stripeKeys.platformAccountId, onlyKey),
						eq(stripeKeys.present, true),
					)
				: and(eq(stripeKeys.usable, true), eq(stripeKeys.present, true)),
		);

	const target = Math.min(targetPerKey, ACCOUNTS_PER_KEY_CAP);
	let created = 0;
	await Promise.all(
		keys.map(async ({ platformAccountId }) => {
			const [{ n }] = await ctx.db
				.select({ n: count() })
				.from(stripeAccounts)
				.where(
					and(
						eq(stripeAccounts.platformAccountId, platformAccountId),
						ne(stripeAccounts.state, "broken"),
					),
				);
			const secretKey = await resolveKeySecret({ ctx, platformAccountId });
			await Promise.all(
				Array.from({ length: Math.max(0, target - n) }, async () => {
					const { id: accountId } = await withStripeRequestSlot(() =>
						stripeForKey({ secret: secretKey }).v2.core.accounts.create(
							{
								contact_email: ctx.actor?.email ?? "system@useautumn.com",
								display_name: POOL_ORG_NAME,
								dashboard: "full",
								metadata: twdPoolMetadata({
									existing: stripeMetadata("twd", "pool", POOL_ORG_ID),
									state: "clean",
								}),
								identity: { country: "us" },
								configuration: { merchant: {} },
								defaults: {
									responsibilities: {
										losses_collector: "stripe",
										fees_collector: "stripe",
									},
								},
							},
							STRIPE_REQUEST_OPTIONS,
						),
					);
					await ctx.db
						.insert(stripeAccounts)
						.values({ id: accountId, platformAccountId, state: "clean" })
						.onConflictDoNothing();
					created++;
				}),
			);
		}),
	);
	ctx.logger.info("twd pool top-up", { targetPerKey: target, created });
	return { created };
};
