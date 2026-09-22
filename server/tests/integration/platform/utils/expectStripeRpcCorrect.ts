import { expect } from "bun:test";

export const expectStripeRpcCorrect = async ({
	response,
	status = 200,
	body,
}: {
	response: Response;
	status?: number;
	body?: Record<string, unknown>;
}) => {
	const result = await response.json();
	expect(response.status, JSON.stringify(result)).toBe(status);
	if (body) expect(result).toEqual(body);
};
