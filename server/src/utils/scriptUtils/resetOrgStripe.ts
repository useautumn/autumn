import { AppEnv, type Organization } from "@autumn/shared";
import { deleteAllStripeCustomers } from "@/external/stripe/stripeCusUtils.js";
import {
	deactivateStripeMeters,
	deleteAllStripeProducts,
} from "@/external/stripe/stripeProductUtils.js";

export const resetOrgStripe = async ({ org }: { org: Organization }) => {
	const env = AppEnv.Sandbox;

	await deleteAllStripeCustomers({
		org,
		env,
	});

	await deleteAllStripeProducts({
		org,
		env,
	});

	await deactivateStripeMeters({
		org,
		env,
	});
};
