import { describe, expect, it } from "bun:test";
import {
	CreateCustomerExportParamsSchema,
	CustomerExportField,
	CustomerExportResponseSchema,
	CustomerExportStatus,
} from "@autumn/shared";

describe("CreateCustomerExportParamsSchema", () => {
	it("rejects duplicate export fields", () => {
		const result = CreateCustomerExportParamsSchema.safeParse({
			fields: [CustomerExportField.Name, CustomerExportField.Name],
		});

		expect(result.success).toBe(false);
	});
});

const runningExportResponse = {
	id: "cusexp_123",
	status: CustomerExportStatus.Running,
	fields: [CustomerExportField.Name],
	snapshot: { search: "", filters: {} },
	requested_by_user_id: null,
	row_count: null,
	byte_count: null,
	error_message: null,
	created_at: 1,
	started_at: 2,
	completed_at: null,
	progress: null,
};

describe("CustomerExportResponseSchema", () => {
	it("requires the realtime subscription fields the dashboard gates on", () => {
		expect(
			CustomerExportResponseSchema.safeParse(runningExportResponse).success,
		).toBe(false);

		const result = CustomerExportResponseSchema.safeParse({
			...runningExportResponse,
			trigger_run_id: "run_123",
			public_access_token: null,
		});

		expect(result.success).toBe(true);
	});
});
