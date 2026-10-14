import { FeatureCombine } from "@autumn/shared";
import { Decimal } from "decimal.js";

export type CompetingShare = {
	poolId: string;
	amount: number;
	unlimited: boolean;
};

export type CompetingPoolState = {
	best: number;
	unlimited: boolean;
};

/** Max: any unlimited share wins. Min: a limited share wins, so unlimited only when nothing limits it. */
export const competingPoolState = ({
	shares,
	combine,
}: {
	shares: CompetingShare[];
	combine: FeatureCombine;
}): CompetingPoolState => {
	const limited = shares
		.filter((share) => !share.unlimited)
		.map((share) => share.amount);
	const hasUnlimited = shares.some((share) => share.unlimited);
	if (limited.length === 0) return { best: 0, unlimited: hasUnlimited };

	const best =
		combine === FeatureCombine.Min
			? Decimal.min(...limited).toNumber()
			: Decimal.max(...limited).toNumber();
	return {
		best,
		unlimited: combine === FeatureCombine.Max && hasUnlimited,
	};
};
