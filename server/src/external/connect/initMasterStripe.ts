import { InternalError } from "@autumn/shared";
import "dotenv/config";
import Stripe from "stripe";

export const initMasterStripe = (params?: {
	accountId?: string;
	legacyVersion?: boolean;
}) => {
	if (!process.env.STRIPE_SECRET_KEY) {
		throw new InternalError({
			message: "STRIPE_SECRET_KEY env variable is not set",
		});
	}

	if (!params) {
		return new Stripe(process.env.STRIPE_SECRET_KEY || "");
	}

	return new Stripe(process.env.STRIPE_SECRET_KEY || "", {
		stripeAccount: params?.accountId,
		apiVersion: params?.legacyVersion
			? ("2025-02-24.acacia" as any)
			: "2025-07-30.basil",
	});
};
