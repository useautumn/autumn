import {
	modalRegionMultiplier,
	parseModalRegions,
} from "@tw/helpers/modalRegion.ts";
import type { z } from "zod";
import type { CostRates } from "../../../api/contract.ts";

/** Modal Sandbox list prices (3x the Function rates); override per deploy without a code change. */
const DEFAULT_USD_PER_CORE_SECOND = 0.00003942;
const DEFAULT_USD_PER_GIB_SECOND = 0.00000667;

export const getCostRates = (): z.infer<typeof CostRates> => ({
	usdPerCoreSecond: Number(
		process.env.TWD_USD_PER_CORE_SECOND ?? DEFAULT_USD_PER_CORE_SECOND,
	),
	usdPerGibSecond: Number(
		process.env.TWD_USD_PER_GIB_SECOND ?? DEFAULT_USD_PER_GIB_SECOND,
	),
	regionMultiplier: Number(
		process.env.TWD_MODAL_REGION_MULTIPLIER ??
			modalRegionMultiplier({
				regions: parseModalRegions({ value: process.env.TW_MODAL_REGION }),
			}),
	),
	workerCores: Number(process.env.TW_MODAL_WORKER_CPU ?? 2),
	workerMemoryGib: Number(process.env.TW_MODAL_WORKER_MEM_MIB ?? 4096) / 1024,
});

export const priceSandboxSeconds = ({
	seconds,
	cores,
	memoryGib,
}: {
	seconds: number;
	cores: number;
	memoryGib: number;
}) => {
	const rates = getCostRates();
	return (
		seconds *
		(cores * rates.usdPerCoreSecond + memoryGib * rates.usdPerGibSecond) *
		rates.regionMultiplier
	);
};
