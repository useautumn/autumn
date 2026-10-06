import type { z } from "zod";
import type { CostRates } from "../../../api/contract.ts";

/** Modal Sandbox list prices (3x the Function rates); override per deploy without a code change. */
const DEFAULT_USD_PER_CORE_SECOND = 0.00003942;
const DEFAULT_USD_PER_GIB_SECOND = 0.00000667;
/** scripts/tw/helpers/modal.ts pins every sandbox to this region when TW_MODAL_REGION is unset. */
const DEFAULT_MODAL_REGION = "us-east-1";
const BROAD_MODAL_REGIONS = new Set(["us", "eu", "ap"]);
const BROAD_REGION_MULTIPLIER = 1.15;
const NARROW_REGION_MULTIPLIER = 1.75;

/** Modal's surcharge for a pinned region: 1.15x broad (`us`), 1.75x narrow (`us-east-1`). */
const modalRegionMultiplier = ({ region }: { region: string }) =>
	BROAD_MODAL_REGIONS.has(region)
		? BROAD_REGION_MULTIPLIER
		: NARROW_REGION_MULTIPLIER;

export const getCostRates = (): z.infer<typeof CostRates> => ({
	usdPerCoreSecond: Number(
		process.env.TWD_USD_PER_CORE_SECOND || DEFAULT_USD_PER_CORE_SECOND,
	),
	usdPerGibSecond: Number(
		process.env.TWD_USD_PER_GIB_SECOND || DEFAULT_USD_PER_GIB_SECOND,
	),
	regionMultiplier: Number(
		process.env.TWD_MODAL_REGION_MULTIPLIER ||
			modalRegionMultiplier({
				region: process.env.TW_MODAL_REGION ?? DEFAULT_MODAL_REGION,
			}),
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
