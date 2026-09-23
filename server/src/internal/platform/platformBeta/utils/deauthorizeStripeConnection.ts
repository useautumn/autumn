import { AppEnv, organizations, RecaseError } from "@autumn/shared";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import Stripe from "stripe";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import { LOCK_HELD_STRIPE_REQUEST_OPTIONS } from "@/external/stripe/common/stripeConstants.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const deauthorizeStripeConnection = async ({
	ctx,
	accountId,
}: {
	ctx: Pick<AutumnContext, "db" | "org" | "env">;
	accountId: string;
}) => {
	const { db, org, env } = ctx;
	const connectField =
		env === AppEnv.Live ? "live_stripe_connect" : "test_stripe_connect";
	if (org[connectField]?.master_org_id)
		throw new RecaseError({
			message: "Platform-managed Stripe accounts are not OAuth connections",
			statusCode: 400,
		});
	const [shared] = await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(
			and(
				ne(organizations.id, org.id),
				eq(sql`${organizations[connectField]}->>'account_id'`, accountId),
				isNull(sql`${organizations[connectField]}->>'master_org_id'`),
			),
		)
		.limit(1);
	if (shared)
		throw new RecaseError({
			message:
				"This Stripe OAuth account is shared with another organization and cannot be disconnected independently",
			statusCode: 409,
		});
	const clientId =
		env === AppEnv.Live
			? process.env.STRIPE_LIVE_CLIENT_ID
			: process.env.STRIPE_SANDBOX_CLIENT_ID;
	if (!clientId)
		throw new RecaseError({
			message: "Stripe OAuth is not configured for this environment",
			statusCode: 500,
		});
	const stripe = initMasterStripe({ env });
	try {
		await stripe.oauth.deauthorize(
			{ client_id: clientId, stripe_user_id: accountId },
			LOCK_HELD_STRIPE_REQUEST_OPTIONS,
		);
	} catch (error) {
		if (
			!(error instanceof Stripe.errors.StripeError) ||
			(error.rawType !== "invalid_grant" &&
				error.type !== "StripeAuthenticationError")
		)
			throw error;
		try {
			await stripe.accounts.retrieve(
				accountId,
				{},
				LOCK_HELD_STRIPE_REQUEST_OPTIONS,
			);
		} catch (lookupError) {
			if (
				lookupError instanceof Stripe.errors.StripeError &&
				lookupError.code === "account_invalid"
			)
				return;
			throw lookupError;
		}
		throw error;
	}
};
