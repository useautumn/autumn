/**
 * Contract (E5b–e): every area's write gates its opener on one action id, members
 * aren't gated yet, and a `permission_denied` toast names the rule and its note.
 */

import { describe, expect, test } from "bun:test";
import { ACTIONS } from "@autumn/shared";
import { AxiosError, type AxiosResponse } from "axios";
import { APPROVAL_OPENERS } from "@/components/forms/shared/permission/approvalOpeners";
import { CREDIT_NOTE_DENIAL_SECTIONS } from "@/components/forms/shared/permission/permissionDenialUtils";
import { getBackendErr } from "@/utils/genUtils";

const axiosError = ({ status, data }: { status: number; data: object }) =>
	new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
		status,
		data,
	} as AxiosResponse);

describe("approval openers", () => {
	test.each(Object.entries(APPROVAL_OPENERS))(
		"%s gates on a known action (%s)",
		(_opener, action) => {
			expect(Object.keys(ACTIONS)).toContain(action);
		},
	);

	test("members actions aren't gated until better-auth routes are wired", () => {
		const actions: string[] = Object.values(APPROVAL_OPENERS);
		expect(actions.some((action) => action.startsWith("members."))).toBe(false);
	});
});

describe("permission denial toast", () => {
	test("names the rule and its note", () => {
		const error = axiosError({
			status: 403,
			data: {
				code: "permission_denied",
				env: "live",
				message: "Only Finance can void invoices.",
				violations: [],
				decided_by: {
					level: "role",
					rule_id: "apr_1",
					rule_name: "Invoice voids",
				},
				allowed_roles: ["finance"],
			},
		});
		expect(getBackendErr(error, "Failed")).toBe(
			"Invoice voids: Only Finance can void invoices.",
		);
	});

	test("other errors keep their message", () => {
		const error = axiosError({
			status: 400,
			data: { code: "invalid_inputs", message: "Bad input" },
		});
		expect(getBackendErr(error, "Failed")).toBe("Bad input");
	});
});

test("credit note refund violations sit on the amount field", () => {
	expect(CREDIT_NOTE_DENIAL_SECTIONS.refund).toBe("amount");
});
