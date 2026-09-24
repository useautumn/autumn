import type { CustomerExportPhase } from "@autumn/shared";

export type CustomerExportProgressReporter = {
	setTotalRows: (rowCount: number) => Promise<void> | void;
	/** Entering a phase restarts its processed count from zero. */
	setPhase: (phase: CustomerExportPhase) => Promise<void> | void;
	incrementProcessedRows: (rowCount: number) => Promise<void> | void;
};
