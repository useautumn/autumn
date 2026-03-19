/**
 * Svix endpoint utilities for usage alert webhook tests.
 * Creates temporary endpoints filtered to `balances.threshold_reached` events.
 */

import { Svix } from "svix";

let svixClient: Svix | null = null;

const getSvixClient = (): Svix => {
	if (!svixClient) {
		const apiKey = process.env.SVIX_API_KEY;
		if (!apiKey) {
			throw new Error(
				"SVIX_API_KEY environment variable is required for webhook tests",
			);
		}
		svixClient = new Svix(apiKey);
	}
	return svixClient;
};

export const createUsageAlertTestEndpoint = async ({
	appId,
	playUrl,
}: {
	appId: string;
	playUrl: string;
}): Promise<string> => {
	const svix = getSvixClient();

	const endpoint = await svix.endpoint.create(appId, {
		url: playUrl,
		description: "Test endpoint for usage alert webhook tests",
		filterTypes: ["balances.threshold_reached"],
	});

	return endpoint.id;
};

export const deleteUsageAlertTestEndpoint = async ({
	appId,
	endpointId,
}: {
	appId: string;
	endpointId: string;
}): Promise<void> => {
	const svix = getSvixClient();

	try {
		await svix.endpoint.delete(appId, endpointId);
	} catch (error) {
		console.warn(`Failed to delete test endpoint ${endpointId}:`, error);
	}
};
