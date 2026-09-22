import { describe, expect, it } from "bun:test";
import {
	CUSTOMER_EXPORT_PHASE_KEY,
	CUSTOMER_EXPORT_PROCESSED_ROWS_KEY,
	CUSTOMER_EXPORT_TOTAL_ROWS_KEY,
	CustomerExportPhase,
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

	it("returns null when the total is not finite", () => {
		for (const total of [Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(
				runMetadataToCustomerExportProgress({
					metadata: { [CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: total },
				}),
			).toBe(null);
		}
	});

	it("treats a non-finite processed counter as zero", () => {
		for (const processed of [Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(
				runMetadataToCustomerExportProgress({
					metadata: {
						[CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: 1000,
						[CUSTOMER_EXPORT_PROCESSED_ROWS_KEY]: processed,
					},
				}),
			).toEqual({
				phase: CustomerExportPhase.Exporting,
				processed_rows: 0,
				total_rows: 1000,
			});
		}
	});

	it("defaults processed to zero before any worker reports", () => {
		expect(
			runMetadataToCustomerExportProgress({
				metadata: { [CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: 1000 },
			}),
		).toEqual({
			phase: CustomerExportPhase.Exporting,
			processed_rows: 0,
			total_rows: 1000,
		});
	});

	it("maps a mid-flight counter", () => {
		expect(
			runMetadataToCustomerExportProgress({
				metadata: {
					[CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: 1000,
					[CUSTOMER_EXPORT_PROCESSED_ROWS_KEY]: 250,
				},
			}),
		).toEqual({
			phase: CustomerExportPhase.Exporting,
			processed_rows: 250,
			total_rows: 1000,
		});
	});

	it("caps over-counted retried workers at the total", () => {
		expect(
			runMetadataToCustomerExportProgress({
				metadata: {
					[CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: 1000,
					[CUSTOMER_EXPORT_PROCESSED_ROWS_KEY]: 1500,
				},
			}),
		).toEqual({
			phase: CustomerExportPhase.Exporting,
			processed_rows: 1000,
			total_rows: 1000,
		});
	});

	it("defaults to the exporting phase when the run never set one", () => {
		expect(
			runMetadataToCustomerExportProgress({
				metadata: {
					[CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: 100,
					[CUSTOMER_EXPORT_PROCESSED_ROWS_KEY]: 40,
				},
			}),
		).toEqual({
			phase: CustomerExportPhase.Exporting,
			processed_rows: 40,
			total_rows: 100,
		});
	});

	it("reports the scan count uncapped while scanning", () => {
		expect(
			runMetadataToCustomerExportProgress({
				metadata: {
					[CUSTOMER_EXPORT_PHASE_KEY]: CustomerExportPhase.Scanning,
					[CUSTOMER_EXPORT_TOTAL_ROWS_KEY]: 100,
					[CUSTOMER_EXPORT_PROCESSED_ROWS_KEY]: 136_000,
				},
			}),
		).toEqual({
			phase: CustomerExportPhase.Scanning,
			processed_rows: 136_000,
			total_rows: 100,
		});
	});
});
