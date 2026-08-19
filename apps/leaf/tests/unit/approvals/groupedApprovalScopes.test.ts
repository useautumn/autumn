import { describe, expect, test } from "bun:test";
import { Scopes } from "@autumn/shared";
import { requiredScopesForApproval } from "../../../src/internal/approvals/utils/approvalScopeRequirements.js";

// A grouped card applies every step, so approving it must demand every step's
// scopes — otherwise billing:write alone could apply a customer change.
describe("grouped approvals require the union of step scopes", () => {
	test("unions the primary tool and its grouped steps", () => {
		expect(
			requiredScopesForApproval({
				toolArgs: {
					_eveWithheldWrites: [
						{ requestId: "req_2", toolName: "autumn__updateCustomer" },
					],
				},
				toolName: "attach",
			}),
		).toEqual({
			ALL: [Scopes.Billing.Write, Scopes.Customers.Write],
		});
	});

	test("a single write keeps its own requirement unchanged", () => {
		expect(
			requiredScopesForApproval({ toolArgs: {}, toolName: "attach" }),
		).toEqual([Scopes.Billing.Write]);
	});

	test("a grouped ANY requirement fails closed rather than guessing", () => {
		expect(
			requiredScopesForApproval({
				toolArgs: {
					_eveWithheldWrites: [
						{ requestId: "req_2", toolName: "autumn__updateCatalog" },
					],
				},
				toolName: "attach",
			}),
		).toEqual({
			ALL: [Scopes.Billing.Write, Scopes.Plans.Write, Scopes.Features.Write],
		});
	});

	test("an unknown grouped tool fails closed", () => {
		expect(
			requiredScopesForApproval({
				toolArgs: {
					_eveWithheldWrites: [
						{ requestId: "req_2", toolName: "autumn__somethingNew" },
					],
				},
				toolName: "attach",
			}),
		).toBeUndefined();
	});
});
