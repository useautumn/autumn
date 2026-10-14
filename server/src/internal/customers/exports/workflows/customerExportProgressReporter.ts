import type { CustomerExportPhase } from "@autumn/shared";

export type CustomerExportProgressReporter = {
	setTotalRows: (rowCount: number) => Promise<void> | void;
	setPhase: (phase: CustomerExportPhase) => Promise<void> | void;
	incrementProcessedRows: (rowCount: number) => Promise<void> | void;
};
