/**
 * Utilities for managing Svix endpoints during webhook tests.
 * Creates temporary endpoints pointing to Svix Play for test verification.
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

/**
 * Create a test endpoint pointing to Svix Play.
 * The endpoint will receive all webhook events from the org's Svix app.
 */
export const createTestEndpoint = async ({
	appId,
	playUrl,
}: {
	appId: string;
	playUrl: string;
}): Promise<string> => {
	const svix = getSvixClient();

	const endpoint = await svix.endpoint.create(appId, {
		url: playUrl,
		description: "Test endpoint for webhook integration tests",
		filterTypes: ["customer.products.updated"],
	});

	return endpoint.id;
};

/**
 * Delete a test endpoint after tests complete.
 */
export const deleteTestEndpoint = async ({
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
		// Log but don't fail if cleanup fails
		console.warn(`Failed to delete test endpoint ${endpointId}:`, error);
	}
};
