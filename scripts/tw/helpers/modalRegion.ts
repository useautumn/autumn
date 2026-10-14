const BROAD_MODAL_REGIONS = new Set(["us", "eu", "ap"]);
const BROAD_REGION_MULTIPLIER = 1.15;
const NARROW_REGION_MULTIPLIER = 1.75;

export const modalRegions = (): string[] | undefined => {
	const regions = (process.env.TW_MODAL_REGION ?? "")
		.split(",")
		.map((region) => region.trim())
		.filter(Boolean);
	return regions.length > 0 ? regions : undefined;
};

export const modalRegionMultiplier = (): number => {
	const regions = modalRegions();
	if (!regions) return 1;
	return regions.some((region) => BROAD_MODAL_REGIONS.has(region))
		? BROAD_REGION_MULTIPLIER
		: NARROW_REGION_MULTIPLIER;
};
