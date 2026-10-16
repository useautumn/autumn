/**
 * Contract: a `permission_denied` write error renders inline in the sheet, so
 * it gets no toast; every other error still toasts.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const toastError = mock((_message: string) => {});
mock.module("sonner", () => ({ toast: { error: toastError } }));

const { toastWriteError } = await import(
	"@/components/forms/shared/permission/toastWriteError"
);

const permissionDenied = {
	response: {
		status: 403,
		data: {
			code: "permission_denied",
			env: "live",
			message: "Sales can grant up to 50 credits.",
			violations: [],
			decided_by: { level: "role", rule_id: "apr_1", rule_name: "Sales" },
			allowed_roles: [],
		},
	},
};

beforeEach(() => toastError.mockClear());

describe("toastWriteError", () => {
	test("a permission denial shows no toast", () => {
		toastWriteError({ error: permissionDenied, fallback: "Failed" });
		expect(toastError).not.toHaveBeenCalled();
	});

	test("any other error still toasts", () => {
		toastWriteError({ error: new Error("boom"), fallback: "Failed" });
		expect(toastError).toHaveBeenCalledWith("Failed");
	});
});
