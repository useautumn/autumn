import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Expires a checkout session at Stripe. False = the session is NOT expired —
 *  it's completing/completed (won the race) or could not be verified. */
export const expireStripeCheckoutSession = async ({
	ctx,
	checkoutSessionId,
}: {
	ctx: AutumnContext;
	checkoutSessionId: string;
}): Promise<boolean> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	try {
		await stripeCli.checkout.sessions.expire(checkoutSessionId);
		return true;
	} catch (expireError) {
		// Stripe rejects expiring a completing/completed session — verify before reporting expired.
		try {
			const checkoutSession =
				await stripeCli.checkout.sessions.retrieve(checkoutSessionId);
			if (checkoutSession.status !== "expired") {
				ctx.logger.info(
					`Checkout session ${checkoutSessionId} is ${checkoutSession.status}; not expiring`,
					{ expireError },
				);
				return false;
			}
			return true;
		} catch (retrieveError) {
			ctx.logger.warn(
				`Could not verify checkout session ${checkoutSessionId}; treating as not expired`,
				{ expireError, retrieveError },
			);
			return false;
		}
	}
};
