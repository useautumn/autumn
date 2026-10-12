/** One charge a tiered usage price bills: units in a tier, or a volume tier's flat fee. */
export type TierLineBand = {
	kind: "usage" | "flat_fee";
	/** Usage position the tier starts after, counting included units. */
	tierStart: number;
	/** Last usage position in the tier, or null for the open-ended final tier. */
	tierEnd: number | null;
	/** Units charged at `unitAmount` per billing-units pack; 1 for a flat fee. */
	quantity: number;
	unitAmount: number;
	amount: number;
};
