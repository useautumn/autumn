export type CustomerExportProgressReporter = {
	setTotalRows: (rowCount: number) => Promise<void> | void;
	resetProcessedRows: () => Promise<void> | void;
	incrementProcessedRows: (rowCount: number) => Promise<void> | void;
};
