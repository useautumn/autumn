import { expect } from "bun:test";
import { ErrCode } from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export type RawResponse = { status: number; body: Record<string, unknown> };

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

/** A 403 `permission_denied` in the §3 shape. */
export const expectPermissionDenied = ({
	res,
	violations,
	decidedBy,
	allowedRoles,
	message,
}: {
	res: RawResponse;
	violations?: Record<string, unknown>[];
	decidedBy?: Record<string, unknown>;
	allowedRoles?: string[];
	message?: string;
}) => {
	expect(res.status).toBe(403);
	const {
		code,
		message: bodyMessage,
		violations: bodyViolations,
		decided_by,
		allowed_roles,
	} = res.body as {
		code: string;
		message: string;
		violations: unknown[];
		decided_by: Record<string, unknown>;
		allowed_roles: string[];
	};
	expect(code).toBe(ErrCode.PermissionDenied);
	expect(bodyMessage).toBeString();
	expect(bodyViolations).toBeArray();
	expect(Object.keys(decided_by).sort()).toEqual([
		"level",
		"rule_id",
		"rule_name",
	]);
	expect(allowed_roles).toBeArray();
	if (violations) {
		expect(res.body.violations).toEqual(
			violations.map((violation) => expect.objectContaining(violation)),
		);
	}
	if (decidedBy) expect(res.body.decided_by).toMatchObject(decidedBy);
	if (allowedRoles) expect(res.body.allowed_roles).toEqual(allowedRoles);
	if (message) expect(res.body.message).toBe(message);
};
