/**
 * Independent expectation for invoices.create amounts. Plain arithmetic only:
 * deliberately shares no pricing code with the server.
 */

export type OracleTier = {
	to: number | "inf";
	amount: number;
	flat_amount?: number;
};

export type OracleInterval = "month" | "year";

export type OraclePrice = {
	billingUnits: number;
	tiers: OracleTier[];
	volume: boolean;
	interval: OracleInterval;
};

export type OraclePeriod = { start: number; end: number };

export type OracleLine = {
	featureId: string | null;
	amount: number;
	quantity: number | null;
	prorated: boolean;
};

export const roundToCents = (amount: number) =>
	Math.round((amount + Number.EPSILON) * 100) / 100;

const tierCeiling = (tier: OracleTier) =>
	tier.to === "inf" ? Number.POSITIVE_INFINITY : tier.to;

/** Feature units → money: round up to whole billing units, then graduated or volume tiers. */
export const oracleQuantityToAmount = ({
	price,
	quantity,
}: {
	price: OraclePrice;
	quantity: number;
}): number => {
	if (quantity <= 0) return 0;
	const units = price.billingUnits;
	const billed = Math.ceil(quantity / units) * units;

	if (price.volume) {
		const tier =
			price.tiers.find((candidate) => billed <= tierCeiling(candidate)) ??
			price.tiers[price.tiers.length - 1];
		return (tier.amount / units) * billed + (tier.flat_amount ?? 0);
	}

	let total = 0;
	let floor = 0;
	for (const tier of price.tiers) {
		const ceiling = tierCeiling(tier);
		const inTier = Math.max(0, Math.min(billed, ceiling) - floor);
		total += (tier.amount / units) * inTier;
		if (billed <= ceiling) break;
		floor = ceiling;
	}
	return total;
};

const addIntervalUtc = ({
	from,
	interval,
}: {
	from: number;
	interval: OracleInterval;
}) => {
	const date = new Date(from);
	return Date.UTC(
		date.getUTCFullYear() + (interval === "year" ? 1 : 0),
		date.getUTCMonth() + (interval === "month" ? 1 : 0),
		date.getUTCDate(),
		date.getUTCHours(),
		date.getUTCMinutes(),
		date.getUTCSeconds(),
	);
};

/** Whole intervals from period.start bill in full; the trailing partial interval by time fraction. */
export const oracleProrate = ({
	amount,
	interval,
	period,
}: {
	amount: number;
	interval: OracleInterval;
	period?: OraclePeriod;
}): number => {
	if (!period) return amount;
	let cycleStart = period.start;
	let wholeCycles = 0;
	while (addIntervalUtc({ from: cycleStart, interval }) <= period.end) {
		cycleStart = addIntervalUtc({ from: cycleStart, interval });
		wholeCycles += 1;
	}
	const cycleEnd = addIntervalUtc({ from: cycleStart, interval });
	const fraction = (period.end - cycleStart) / (cycleEnd - cycleStart);
	return roundToCents(amount * wholeCycles + amount * fraction);
};
