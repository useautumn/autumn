import { getCostRates } from "../../costs/actions/getCostRates.ts";

/** e.g. "2c4g-us-east-1": profiles from different worker sizes or regions never mix. */
export const getWorkerClass = () => {
	const { workerCores, workerMemoryGib } = getCostRates();
	const region = process.env.TW_MODAL_REGION || "us-east-1";
	return `${workerCores}c${workerMemoryGib}g-${region}`;
};
