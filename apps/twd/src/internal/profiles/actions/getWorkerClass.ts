import { modalRegions } from "@tw/helpers/modalRegion.ts";
import { getCostRates } from "../../costs/actions/getCostRates.ts";

export const getWorkerClass = () => {
	const { workerCores, workerMemoryGib } = getCostRates();
	const placement = modalRegions()?.join("+") ?? "unpinned";
	return `${workerCores}c${workerMemoryGib}g-${placement}`;
};
