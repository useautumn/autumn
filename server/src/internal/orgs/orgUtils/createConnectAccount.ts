import "dotenv/config";
import { AppEnv } from "@autumn/shared";
import type { User } from "better-auth";
import type { Organization } from "better-auth/plugins";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";

export const createConnectAccount = async ({
	org,
	user,
	metadata,
}: {
	org: Organization;
	user: Pick<User, "email">;
	metadata?: Record<string, string>;
}) => {
	const stripe = initMasterStripe({
		env: AppEnv.Sandbox,
		legacyVersion: false,
	});

	console.log("Creating connect account for org:", org.name);

	const account = await stripe.v2.core.accounts.create({
		contact_email: user.email,
		display_name: org.name,
		dashboard: "full",
		...(metadata ? { metadata } : {}),
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
