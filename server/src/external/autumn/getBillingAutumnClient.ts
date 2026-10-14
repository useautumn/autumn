import { type AutumnClient, createAutumnClient } from "@autumn/billing";

let client: AutumnClient | undefined;

export const getBillingAutumnClient = (): AutumnClient => {
	client ??= createAutumnClient({
		config: {
			secretKey: process.env.AUTUMN_SECRET_KEY ?? "",
			allowLiveKey: true,
		},
	});
	return client;
};
