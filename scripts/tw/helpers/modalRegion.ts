/** Modal's broad regions; every other region name is narrow (https://modal.com/docs/guide/region-selection). */
const BROAD_REGIONS = new Set(["us", "eu", "ap"]);
const BROAD_MULTIPLIER = 1.15;
const NARROW_MULTIPLIER = 1.75;

/** `TW_MODAL_REGION` as a V2 `regions` list; empty means unpinned. */
export const parseModalRegions = ({
	value,
}: {
	value: string | undefined;
}): string[] =>
	(value ?? "")
		.split(",")
		.map((region) => region.trim())
		.filter(Boolean);

/** Modal's surcharge on base prices for a region pin; a mixed pin pays the smaller one. */
export const modalRegionMultiplier = ({
	regions,
}: {
	regions: string[];
}): number =>
	regions.length === 0
		? 1
		: Math.min(
				...regions.map((region) =>
					BROAD_REGIONS.has(region) ? BROAD_MULTIPLIER : NARROW_MULTIPLIER,
				),
			);
