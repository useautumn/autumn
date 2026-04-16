import { AutumnError } from "autumn-js";

export function parseApiError(err: unknown): string {
	if (err instanceof AutumnError) {
		try {
			const body = JSON.parse(err.body);
			if (body.message) return body.message;
		} catch {}
	}
	if (err instanceof Error) return err.message;
	return String(err);
}

export function str(val: unknown, fallback = ""): string {
	return typeof val === "string" ? val : fallback;
}

export function num(val: unknown, fallback = 0): number {
	const n = Number(val);
	return Number.isNaN(n) ? fallback : n;
}

type Raw = Record<string, unknown>;

function mapReset(r: unknown): { interval: string; intervalCount?: number } | undefined {
	if (!r || typeof r !== "object") return undefined;
	const raw = r as Raw;
	return {
		interval: str(raw.interval),
		...(raw.interval_count != null ? { intervalCount: num(raw.interval_count) } : {}),
	};
}

function mapItemPrice(p: unknown): Record<string, unknown> | undefined {
	if (!p || typeof p !== "object") return undefined;
	const raw = p as Raw;
	const out: Record<string, unknown> = {
		interval: str(raw.interval),
		billingMethod: str(raw.billing_method),
	};
	if (raw.amount != null) out.amount = num(raw.amount);
	if (raw.tiers && Array.isArray(raw.tiers)) {
		out.tiers = (raw.tiers as Raw[]).map((t) => ({
			to: t.to === "inf" ? "inf" : num(t.to),
			amount: num(t.amount),
		}));
	}
	if (raw.interval_count != null) out.intervalCount = num(raw.interval_count);
	if (raw.billing_units != null) out.billingUnits = num(raw.billing_units);
	if (raw.max_purchase != null) out.maxPurchase = num(raw.max_purchase);
	return out;
}

function mapProration(p: unknown): { onIncrease: string; onDecrease: string } | undefined {
	if (!p || typeof p !== "object") return undefined;
	const raw = p as Raw;
	return {
		onIncrease: str(raw.on_increase),
		onDecrease: str(raw.on_decrease),
	};
}

function mapRollover(r: unknown): Record<string, unknown> | undefined {
	if (!r || typeof r !== "object") return undefined;
	const raw = r as Raw;
	const out: Record<string, unknown> = {
		expiryDurationType: str(raw.expiry_duration_type),
	};
	if (raw.max != null) out.max = num(raw.max);
	if (raw.expiry_duration_length != null)
		out.expiryDurationLength = num(raw.expiry_duration_length);
	return out;
}

export function mapPlanItems(items: unknown): Record<string, unknown>[] | undefined {
	if (!items || !Array.isArray(items)) return undefined;
	return (items as Raw[]).map((item) => {
		const out: Record<string, unknown> = { featureId: str(item.feature_id) };
		if (item.included != null) out.included = num(item.included);
		if (item.unlimited != null) out.unlimited = !!item.unlimited;
		const reset = mapReset(item.reset);
		if (reset) out.reset = reset;
		const price = mapItemPrice(item.price);
		if (price) out.price = price;
		const proration = mapProration(item.proration);
		if (proration) out.proration = proration;
		const rollover = mapRollover(item.rollover);
		if (rollover) out.rollover = rollover;
		return out;
	});
}

export function mapBasePrice(
	p: unknown,
): { amount: number; interval: string; intervalCount?: number } | null | undefined {
	if (p === null) return null;
	if (!p || typeof p !== "object") return undefined;
	const raw = p as Raw;
	return {
		amount: num(raw.amount),
		interval: str(raw.interval),
		...(raw.interval_count != null ? { intervalCount: num(raw.interval_count) } : {}),
	};
}

export function mapFreeTrial(t: unknown): Record<string, unknown> | null | undefined {
	if (t === null) return null;
	if (!t || typeof t !== "object") return undefined;
	const raw = t as Raw;
	const out: Record<string, unknown> = {
		durationLength: num(raw.duration_length),
	};
	if (raw.duration_type) out.durationType = str(raw.duration_type);
	if (raw.card_required != null) out.cardRequired = !!raw.card_required;
	return out;
}

export function mapCustomize(c: unknown): Record<string, unknown> | undefined {
	if (!c || typeof c !== "object") return undefined;
	const raw = c as Raw;
	const out: Record<string, unknown> = {};
	const price = mapBasePrice(raw.price);
	if (price !== undefined) out.price = price;
	const items = mapPlanItems(raw.items);
	if (items) out.items = items;
	const trial = mapFreeTrial(raw.free_trial);
	if (trial !== undefined) out.freeTrial = trial;
	return Object.keys(out).length > 0 ? out : undefined;
}
