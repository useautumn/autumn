import { expect } from "bun:test";
import { callStripeRpc } from "./platformStripeFixture.js";

/** Calls a Platform Stripe RPC and asserts its status and, optionally, its body. */
export const expectStripeRpcCorrect = async ({
	operation,
	slug,
	env = "test",
	key,
	status = 200,
	body,
}: {
	operation: "get_stripe_connection" | "disconnect_stripe";
	slug: string;
	env?: string;
	key?: string;
	status?: number;
	body?: Record<string, unknown>;
}) => {
	const response = await callStripeRpc({
		operation,
		body: { organization_slug: slug, env },
		key,
	});
	const result = await response.json();
	expect(response.status, JSON.stringify(result)).toBe(status);
	if (body) expect(result).toEqual(body);
};
