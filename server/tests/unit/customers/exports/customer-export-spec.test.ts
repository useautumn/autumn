import { describe, expect, it } from "bun:test";
import {
	CustomerExportField,
	CustomerExportKind,
	type DbCustomerExport,
} from "@autumn/shared";
import {
	createParamsToCustomerExportSpec,
	customerExportToSpec,
} from "@/internal/customers/exports/customerExportToSpec.js";

const rowWith = (row: Pick<DbCustomerExport, "kind" | "fields" | "snapshot">) =>
	row as DbCustomerExport;

describe("customerExportToSpec", () => {
	it("defaults the unlinked toggle off for billing rows written before it existed", () => {
		const spec = customerExportToSpec({
			customerExport: rowWith({
				kind: CustomerExportKind.BillingVerify,
				fields: [],
				snapshot: { search: "", filters: {} } as DbCustomerExport["snapshot"],
			}),
		});
		expect(spec).toEqual({
			kind: CustomerExportKind.BillingVerify,
			fields: [],
			snapshot: {
				search: "",
				filters: {},
				include_unlinked_stripe_customers: false,
			},
		});
	});

	it("keeps a customers export's fields and plain scope", () => {
		const spec = customerExportToSpec({
			customerExport: rowWith({
				kind: CustomerExportKind.Customers,
				fields: [CustomerExportField.Email],
				snapshot: { search: "acme", filters: {} },
			}),
		});
		expect(spec).toEqual({
			kind: CustomerExportKind.Customers,
			fields: [CustomerExportField.Email],
			snapshot: { search: "acme", filters: {} },
		});
	});

	it("rejects a customers row with no fields", () => {
		expect(() =>
			customerExportToSpec({
				customerExport: rowWith({
					kind: CustomerExportKind.Customers,
					fields: [],
					snapshot: { search: "", filters: {} },
				}),
			}),
		).toThrow();
	});
});

describe("createParamsToCustomerExportSpec", () => {
	it("carries the toggle and trims search for a billing export", () => {
		expect(
			createParamsToCustomerExportSpec({
				params: {
					kind: CustomerExportKind.BillingVerify,
					search: "  acme ",
					filters: {},
					include_unlinked_stripe_customers: true,
				},
			}),
		).toEqual({
			kind: CustomerExportKind.BillingVerify,
			fields: [],
			snapshot: {
				search: "acme",
				filters: {},
				include_unlinked_stripe_customers: true,
			},
		});
	});

	it("never puts billing options on a customers export", () => {
		expect(
			createParamsToCustomerExportSpec({
				params: {
					kind: CustomerExportKind.Customers,
					search: "",
					filters: {},
					fields: [CustomerExportField.Name],
				},
			}).snapshot,
		).toEqual({ search: "", filters: {} });
	});

	it("gives a custom plans export the plain scope and no fields", () => {
		expect(
			createParamsToCustomerExportSpec({
				params: {
					kind: CustomerExportKind.CustomPlans,
					search: " pro ",
					filters: { version: ["pro_yearly:3"] },
					apply: false,
				},
			}),
		).toEqual({
			kind: CustomerExportKind.CustomPlans,
			fields: [],
			snapshot: {
				search: "pro",
				filters: { version: ["pro_yearly:3"] },
				apply: false,
			},
		});
	});

	it("carries an apply request onto the custom plans snapshot", () => {
		expect(
			createParamsToCustomerExportSpec({
				params: {
					kind: CustomerExportKind.CustomPlans,
					search: "",
					filters: {},
					apply: true,
				},
			}).snapshot,
		).toEqual({ search: "", filters: {}, apply: true });
	});

	it("defaults apply off for custom plans rows", () => {
		expect(
			customerExportToSpec({
				customerExport: rowWith({
					kind: CustomerExportKind.CustomPlans,
					fields: [],
					snapshot: { search: "", filters: {} } as DbCustomerExport["snapshot"],
				}),
			}).snapshot,
		).toEqual({ search: "", filters: {}, apply: false });
	});
});
