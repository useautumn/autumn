/**
 * Contract (E5b–e): every area's write gates its opener on one action id, members
 * aren't gated yet, and a `permission_denied` toast names the rule and its note.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const toastError = mock((_message: string) => {});
mock.module("sonner", () => ({ toast: { error: toastError } }));

const { APPROVAL_OPENERS } = await import(
	"@/components/forms/shared/permission/approvalOpeners"
);
const { ACTIONS } = await import("@autumn/shared");
const { toastWriteError } = await import(
	"@/components/forms/shared/permission/toastWriteError"
);
const { CREDIT_NOTE_DENIAL_SECTIONS } = await import(
	"@/views/customers2/components/sheets/creditNoteWrite"
);

beforeEach(() => toastError.mockClear());

describe("approval openers", () => {
	test.each(Object.entries(APPROVAL_OPENERS))(
		"%s gates on a known action (%s)",
		(_opener, action) => {
			expect(Object.keys(ACTIONS)).toContain(action);
		},
	);

	test.each([
		["plans", ["plans.create", "plans.update", "plans.delete"]],
		["features", ["features.create", "features.update", "features.delete"]],
	])("%s gate create, update and delete", (_area, actions) => {
		expect(Object.values(APPROVAL_OPENERS)).toEqual(
			expect.arrayContaining(actions),
		);
	});

	test("members actions aren't gated until better-auth routes are wired", () => {
		const actions: string[] = Object.values(APPROVAL_OPENERS);
		expect(actions.some((action) => action.startsWith("members."))).toBe(false);
	});
});

describe("permission denial toast", () => {
	test("names the rule and its note from details", () => {
		toastWriteError({
			error: {
				response: {
					status: 403,
					data: {
						code: "permission_denied",
						message: "Only Finance can void invoices.",
						details: {
							violations: [],
							decided_by: {
								level: "role",
								rule_id: "apr_1",
								rule_name: "Invoice voids",
							},
							allowed_roles: ["finance"],
						},
					},
				},
			},
			fallback: "Failed",
			inlineDenials: false,
		});
		expect(toastError).toHaveBeenCalledWith(
			"Invoice voids: Only Finance can void invoices.",
		);
	});

	test("other errors keep their message", () => {
		toastWriteError({
			error: new Error("boom"),
			fallback: "Failed",
			inlineDenials: false,
		});
		expect(toastError).toHaveBeenCalledWith("Failed");
	});
});

test("credit note refund violations sit on the amount field", () => {
	expect(CREDIT_NOTE_DENIAL_SECTIONS.refund).toBe("amount");
});
