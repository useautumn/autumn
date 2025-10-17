import "dotenv/config";
import type { User } from "better-auth";
import type { Organization } from "better-auth/plugins";
import { initMasterStripe } from "@/external/connect/initMasterStripe.js";

export const createConnectAccount = async ({
	org,
	user,
}: {
	org: Organization;
	user: User;
}) => {
	const stripe = initMasterStripe();

	const account = await stripe.accounts.create({
		business_type: "company",
		email: user.email,
		country: "us",
		company: {
			name: org.name,
		},
	});

	// const account = await stripe.v2.core.accounts.create({
	// 	contact_email: user.email,
	// 	display_name: org.name,

	// 	dashboard: "full",

	// 	identity: {
	// 		country: "us",
	// 	},

	// 	configuration: {
	// 		merchant: {},
	// 	},
	// 	defaults: {
	// 		responsibilities: {
	// 			losses_collector: "stripe",
	// 			fees_collector: "stripe",
	// 		},
	// 	},
	// });

	return account;
};
