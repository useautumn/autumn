/** Modal's broad regions; any other pin is narrow. https://modal.com/docs/guide/region-selection */
const BROAD_MODAL_REGIONS = new Set(["us", "eu", "ap"]);
const BROAD_REGION_MULTIPLIER = 1.15;
const NARROW_REGION_MULTIPLIER = 1.75;

/** V2 sandbox placement from `TW_MODAL_REGION` (comma-separated); unset means unpinned, which Modal bills at 1x. */
export const modalRegions = (): string[] | undefined => {
	const regions = (process.env.TW_MODAL_REGION ?? "")
		.split(",")
		.map((region) => region.trim())
		.filter(Boolean);
	return regions.length > 0 ? regions : undefined;
};

/** Modal's surcharge for {@link modalRegions}; a pin spanning broad and narrow pays the smaller one. */
export const modalRegionMultiplier = (): number => {
	const regions = modalRegions();
	if (!regions) return 1;
	return regions.some((region) => BROAD_MODAL_REGIONS.has(region))
		? BROAD_REGION_MULTIPLIER
		: NARROW_REGION_MULTIPLIER;
};
