import { type Price, TierBehavior } from "../../../..";

export const priceToStripeTiersMode = ({ price }: { price: Price }) => {
	return price.tier_behavior === TierBehavior.VolumeBased
		? "volume"
		: "graduated";
};
