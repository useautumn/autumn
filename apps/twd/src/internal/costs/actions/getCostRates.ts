import { modalRegionMultiplier } from "@tw/helpers/modalRegion.ts";
import type { z } from "zod";
import type { CostRates } from "../../../api/contract.ts";

/** Modal Sandbox list prices (3x the Function rates); override per deploy without a code change. */
const DEFAULT_USD_PER_CORE_SECOND = 0.00003942;
const DEFAULT_USD_PER_GIB_SECOND = 0.00000667;
export const getCostRates = (): z.infer<typeof CostRates> => ({
	usdPerCoreSecond: Number(
		process.env.TWD_USD_PER_CORE_SECOND || DEFAULT_USD_PER_CORE_SECOND,
	),
	usdPerGibSecond: Number(
		process.env.TWD_USD_PER_GIB_SECOND || DEFAULT_USD_PER_GIB_SECOND,
	),
	regionMultiplier: Number(
		process.env.TWD_MODAL_REGION_MULTIPLIER || modalRegionMultiplier(),
	),
	workerCores: Number(process.env.TW_MODAL_WORKER_CPU ?? 2),
	workerMemoryGib: Number(process.env.TW_MODAL_WORKER_MEM_MIB ?? 4096) / 1024,
});

/** Billed $/s for one sandbox of this size, region surcharge included. */
const sandboxUsdPerSecond = ({
	rates,
	cores,
	memoryGib,
}: {
	rates: z.infer<typeof CostRates>;
	cores: number;
	memoryGib: number;
}) =>
	(cores * rates.usdPerCoreSecond + memoryGib * rates.usdPerGibSecond) *
	rates.regionMultiplier;

export const priceSandboxSeconds = ({
	seconds,
	cores,
	memoryGib,
}: {
	seconds: number;
	cores: number;
	memoryGib: number;
}) =>
	seconds * sandboxUsdPerSecond({ rates: getCostRates(), cores, memoryGib });
