import { modalRegions } from "@tw/helpers/modalRegion.ts";
import { getCostRates } from "../../costs/actions/getCostRates.ts";

/** e.g. "2c4g-unpinned" or "2c4g-us-east-1": profiles from different worker sizes or placements never mix. */
export const getWorkerClass = () => {
	const { workerCores, workerMemoryGib } = getCostRates();
	const placement = modalRegions()?.join("+") ?? "unpinned";
	return `${workerCores}c${workerMemoryGib}g-${placement}`;
};
