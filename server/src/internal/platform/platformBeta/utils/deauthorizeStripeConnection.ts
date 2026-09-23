import { AppEnv, RecaseError } from "@autumn/shared";
import Stripe from "stripe";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";

const isAccountInvalid = (error: unknown) =>
	error instanceof Stripe.errors.StripeError &&
	error.code === "account_invalid";

/** Stripe rejects deauthorizing a grant that is already gone, so confirm it before treating that as success. */
const isAlreadyRevoked = async ({
	stripe,
	accountId,
	error,
}: {
	stripe: Stripe;
	accountId: string;
	error: unknown;
}) => {
	const isRejectedGrant =
		error instanceof Stripe.errors.StripeError &&
		(error.rawType === "invalid_grant" ||
			error.type === "StripeAuthenticationError");
	if (!isRejectedGrant) return false;

	try {
		await stripe.accounts.retrieve(accountId);
		return false;
	} catch (lookupError) {
		if (isAccountInvalid(lookupError)) return true;
		throw lookupError;
	}
};

export const deauthorizeStripeConnection = async ({
	env,
	accountId,
}: {
	env: AppEnv;
	accountId: string;
}) => {
	const clientId =
		env === AppEnv.Live
			? process.env.STRIPE_LIVE_CLIENT_ID
			: process.env.STRIPE_SANDBOX_CLIENT_ID;
	if (!clientId) {
		throw new RecaseError({
			message: "Stripe OAuth is not configured for this environment",
			statusCode: 500,
		});
	}

	const stripe = initMasterStripe({ env });
	try {
		await stripe.oauth.deauthorize({
			client_id: clientId,
			stripe_user_id: accountId,
		});
	} catch (error) {
		if (await isAlreadyRevoked({ stripe, accountId, error })) return;
		throw error;
	}
};
