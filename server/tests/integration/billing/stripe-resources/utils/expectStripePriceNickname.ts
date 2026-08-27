import { expect } from "bun:test";
import type Stripe from "stripe";

export const expectStripePriceNickname = async ({
	ctx,
	stripePriceId,
	nickname,
}: {
	ctx: { stripeCli: Stripe };
	stripePriceId: string;
	nickname: string;
}) => {
	const stripePrice = await ctx.stripeCli.prices.retrieve(stripePriceId);
	expect(stripePrice.nickname).toBe(nickname);
};
