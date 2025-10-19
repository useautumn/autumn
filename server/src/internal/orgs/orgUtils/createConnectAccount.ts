import "dotenv/config";
import { AppEnv } from "@autumn/shared";
import type { User } from "better-auth";
import type { Organization } from "better-auth/plugins";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";

export const createConnectAccount = async ({
	org,
	user,
}: {
	org: Organization;
	user: User;
}) => {
	// For v2 API, need to use specific API version
	const stripe = initMasterStripe({
		env: AppEnv.Sandbox,
		legacyVersion: false, // Ensure using latest API version
	});

	console.log("Creating connect account for org:", org.name);

	// Stripe v2 API for connected accounts
	const account = await stripe.v2.core.accounts.create({
		contact_email: user.email,
		display_name: org.name,
		dashboard: "full",
		identity: {
			country: "us",
		},
		configuration: {
			merchant: {},
		},
		defaults: {
			responsibilities: {
				losses_collector: "stripe",
				fees_collector: "stripe",
			},
		},
	});

	console.log("Created connected account:", account.id);

	return account;
};
