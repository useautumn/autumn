import { AppEnv } from "@autumn/shared";
import Stripe from "stripe";
import {
	initMasterStripe,
	initPlatformStripe,
} from "@/external/connect/initStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const isStripeAuthorizationCurrent = async ({
	ctx,
	connectedAt,
	accountId,
	eventCreated,
}: {
	ctx: Pick<AutumnContext, "org" | "env">;
	connectedAt?: number;
	accountId: string;
	eventCreated: number;
}) => {
	const { env, org } = ctx;
	const connectedSecond =
		connectedAt === undefined ? undefined : Math.floor(connectedAt / 1000);
	if (connectedSecond !== undefined && connectedSecond > eventCreated)
		return true;
	if (connectedSecond !== undefined && connectedSecond < eventCreated)
		return false;
	const connect =
		env === AppEnv.Live ? org.live_stripe_connect : org.test_stripe_connect;
	const stripe = connect?.master_org_id
		? initPlatformStripe({ masterOrg: org.master, env })
		: initMasterStripe({ env });
	try {
		await stripe.accounts.retrieve(accountId);
		return true;
	} catch (error) {
		if (
			error instanceof Stripe.errors.StripeError &&
			error.code === "account_invalid"
		)
			return false;
		throw error;
	}
};
