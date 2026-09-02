import {
	type ApiCreditSchemaItem,
	type CreditSchemaItem,
	type CreditTier,
	dbCreditSchemaItemToApi,
	Infinite,
} from "@autumn/shared";

export type CreditRateType = "flat" | "graduated";

/** Any graduated rate — a rate-card row or one of its dimensions. */
export type GraduatedCreditRate = {
	tier_behavior: "graduated";
	tiers: CreditTier[];
};

export type GraduatedCreditSchemaItem = Extract<
	CreditSchemaItem,
	{ tier_behavior: "graduated" }
>;

const DEFAULT_TIER_STEP = 100;

/** Editing keeps raw input in local component state, but a stale draft can still
 * reach here as a string. */
const toNumber = (value: unknown) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

export const isGraduated = (
	item: CreditSchemaItem,
): item is GraduatedCreditSchemaItem => item.tier_behavior === "graduated";

export const rateTypeOf = (item: CreditSchemaItem): CreditRateType =>
	isGraduated(item) ? "graduated" : "flat";

export const createSchemaItem = (): CreditSchemaItem => ({
	metered_feature_id: "",
	feature_amount: 1,
	credit_amount: 0,
});

/** The flat and graduated variants forbid each other's cost fields, so the
 * switch has to rebuild the item rather than merge into it. */
export const setRateType = ({
	item,
	rateType,
}: {
	item: CreditSchemaItem;
	rateType: CreditRateType;
}): CreditSchemaItem => {
	if (rateType === rateTypeOf(item)) return item;

	const {
		credit_amount: _creditAmount,
		tier_behavior: _tierBehavior,
		tiers: _tiers,
		...base
	} = item;

	if (rateType === "graduated") {
		return {
			...base,
			tier_behavior: "graduated",
			tiers: [{ to: Infinite, credit_amount: toNumber(item.credit_amount) }],
		};
	}

	return { ...base, credit_amount: toNumber(item.tiers?.[0]?.credit_amount) };
};

export const addTier = <T extends GraduatedCreditRate>(item: T): T => {
	const tiers = [...item.tiers];
	const last = tiers.at(-1);

	if (last?.to === Infinite) {
		const previous = tiers.at(-2)?.to;
		tiers[tiers.length - 1] = {
			...last,
			to: (typeof previous === "number" ? previous : 0) + DEFAULT_TIER_STEP,
		};
	}

	tiers.push({ to: Infinite, credit_amount: 0 });
	return { ...item, tiers };
};

export const removeTier = <T extends GraduatedCreditRate>({
	item,
	index,
}: {
	item: T;
	index: number;
}): T => {
	if (item.tiers.length <= 1) return item;

	const tiers = item.tiers.filter((_, i) => i !== index);
	tiers[tiers.length - 1] = { ...tiers[tiers.length - 1], to: Infinite };
	return { ...item, tiers };
};

export const updateTier = <T extends GraduatedCreditRate>({
	item,
	index,
	patch,
}: {
	item: T;
	index: number;
	patch: Partial<CreditTier>;
}): T => {
	const tiers = [...item.tiers];
	const isLast = index === tiers.length - 1;
	tiers[index] = {
		...tiers[index],
		...patch,
		...(isLast ? { to: Infinite } : {}),
	};
	return { ...item, tiers };
};

export const creditSchemaToApi = (
	schema: CreditSchemaItem[],
): ApiCreditSchemaItem[] =>
	schema.map((item) => {
		const base = {
			metered_feature_id: item.metered_feature_id,
			feature_amount:
				item.feature_amount === undefined ? 1 : toNumber(item.feature_amount),
			...(item.dimensions === undefined ? {} : { dimensions: item.dimensions }),
			...(item.multipliers === undefined
				? {}
				: { multipliers: item.multipliers }),
		};

		if (!isGraduated(item)) {
			return dbCreditSchemaItemToApi({
				...base,
				credit_amount: toNumber(item.credit_amount),
			});
		}

		return dbCreditSchemaItemToApi({
			...base,
			tier_behavior: "graduated",
			tiers: item.tiers.map((tier) => ({
				to: tier.to === Infinite ? Infinite : toNumber(tier.to),
				credit_amount: toNumber(tier.credit_amount),
			})),
		});
	});
