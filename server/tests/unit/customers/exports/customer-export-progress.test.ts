import { describe, expect, it } from "bun:test";
import {
	CUSTOMER_EXPORT_PROCESSED_ROWS_KEY,
	CUSTOMER_EXPORT_TOTAL_ROWS_KEY,
	runMetadataToCustomerExportProgress,
} from "@autumn/shared";

describe("runMetadataToCustomerExportProgress", () => {
	it("returns null when the run has no metadata yet", () => {
		expect(runMetadataToCustomerExportProgress({ metadata: undefined })).toBe(
			null,
		);
		expect(runMetadataToCustomerExportProgress({ metadata: {} })).toBe(null);
	});

	it("returns null when the total is missing or malformed", () => {
		expect(
			runMetadataToCustomerExportProgress({
				metadata: { [CUSTOMER_EXPORT_PROCESSED_ROWS_KEY]: 500 },
			}),
		).toBe(null);
		expect(
			runMetadataToCustomerExportProgress({
				metadata: { [CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: "1000" },
			}),
		).toBe(null);
	});

	it("defaults processed to zero before any worker reports", () => {
		expect(
			runMetadataToCustomerExportProgress({
				metadata: { [CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: 1000 },
			}),
		).toEqual({ processed_rows: 0, total_rows: 1000 });
	});

	it("maps a mid-flight counter", () => {
		expect(
			runMetadataToCustomerExportProgress({
				metadata: {
					[CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: 1000,
					[CUSTOMER_EXPORT_PROCESSED_ROWS_KEY]: 250,
				},
			}),
		).toEqual({ processed_rows: 250, total_rows: 1000 });
	});

	it("caps over-counted retried workers at the total", () => {
		expect(
			runMetadataToCustomerExportProgress({
				metadata: {
					[CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: 1000,
					[CUSTOMER_EXPORT_PROCESSED_ROWS_KEY]: 1500,
				},
			}),
		).toEqual({ processed_rows: 1000, total_rows: 1000 });
	});
});
