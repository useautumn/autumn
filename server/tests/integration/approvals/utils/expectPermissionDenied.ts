import { expect } from "bun:test";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export type RawResponse = { status: number; body: Record<string, any> };

/** POSTs as `client` and returns the raw status and body, so a 403's full payload can be checked. */
export const postRaw = async ({
	client,
	path,
	body,
}: {
	client: AutumnInt;
	path: string;
	body: unknown;
}): Promise<RawResponse> => {
	const response = await fetch(`${client.baseUrl}${path}`, {
		method: "POST",
		headers: client.headers,
		body: JSON.stringify(body),
	});
	return { status: response.status, body: await response.json() };
};

/** A 403 `permission_denied` with the decision under `details`. */
export const expectPermissionDenied = ({
	res,
	ruleName,
	violations,
}: {
	res: RawResponse;
	ruleName: string;
	violations?: Record<string, unknown>[];
}) => {
	expect(res.status).toBe(403);
	expect(res.body).toMatchObject({
		code: "permission_denied",
		message: expect.any(String),
		details: {
			decided_by: expect.objectContaining({ rule_name: ruleName }),
			violations: violations
				? expect.arrayContaining(
						violations.map((violation) => expect.objectContaining(violation)),
					)
				: expect.any(Array),
			allowed_roles: expect.any(Array),
		},
	});
	expect(res.body.violations).toBeUndefined();
};
