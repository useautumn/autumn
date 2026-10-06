import { billingVerifyExportConfig } from "../billingVerifyExportConfig.js";

export const toLookupBatches = <T>(items: T[]): T[][] => {
	const { lookupBatchSize } = billingVerifyExportConfig.orphans;
	const batches: T[][] = [];
	for (let offset = 0; offset < items.length; offset += lookupBatchSize) {
		batches.push(items.slice(offset, offset + lookupBatchSize));
	}
	return batches;
};
