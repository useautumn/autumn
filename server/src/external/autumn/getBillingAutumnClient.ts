import { type AutumnClient, createAutumnClient } from "@autumn/billing";

let client: AutumnClient | undefined;

/** Autumn's own org, billing Autumn's customers. */
export const getBillingAutumnClient = (): AutumnClient => {
	client ??= createAutumnClient({
		config: {
			secretKey: process.env.AUTUMN_SECRET_KEY ?? "",
			allowLiveKey: true,
		},
	});
	return client;
};
