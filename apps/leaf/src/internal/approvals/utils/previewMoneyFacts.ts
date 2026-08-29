import { parsePreviewPayload } from "@autumn/render";

type LinePeriod = { end: number; start: number };

type LineFacts = {
	amount?: number;
	key: string;
	period?: LinePeriod;
};

type MoneyFacts = {
	currency?: string;
	incomingPlans: ReadonlyArray<string>;
	lineFacts: ReadonlyArray<LineFacts>;
	outgoingPlans: ReadonlyArray<string>;
	total?: number;
};

// Each compute rounds to cents independently, so a decay-adjusted stored
// amount can miss the freshly rounded one by up to a cent per line.
const CENT_TOLERANCE = 0.011;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const asNumber = (value: unknown): number | undefined =>
	typeof value === "number" ? value : undefined;

const planIds = (value: unknown): string[] =>
	Array.isArray(value)
		? value
				.map((entry) => asRecord(entry)?.plan_id ?? asRecord(entry)?.id)
				.filter((id): id is string => typeof id === "string")
				.sort()
		: [];

const samePlanIds = ({
	current,
	stored,
}: {
	current: ReadonlyArray<string>;
	stored: ReadonlyArray<string>;
}): boolean =>
	stored.length === current.length &&
	stored.every((id, index) => id === current[index]);

const linePeriodOf = (value: unknown): LinePeriod | undefined => {
	const period = asRecord(value);
	const start = asNumber(period?.start);
	const end = asNumber(period?.end);
	return start !== undefined && end !== undefined && end > start
		? { end, start }
		: undefined;
};

const lineFactsOf = (item: unknown): LineFacts => {
	const record = asRecord(item) ?? {};
	return {
		amount: asNumber(record.total) ?? asNumber(record.amount),
		key: `${record.plan_id ?? ""}|${record.feature_id ?? ""}`,
		period: linePeriodOf(record.period),
	};
};

const byLineIdentity = (left: LineFacts, right: LineFacts): number =>
	left.key.localeCompare(right.key) ||
	(left.period?.end ?? 0) - (right.period?.end ?? 0) ||
	(left.amount ?? 0) - (right.amount ?? 0);

const moneyFactsOf = (preview: unknown): MoneyFacts | undefined => {
	// Stored previews may carry the `{_display, preview}` enrichment wrapper.
	const unwrapped = asRecord(preview)?._display
		? (asRecord(preview)?.preview ?? preview)
		: preview;
	const record = asRecord(parsePreviewPayload(unwrapped) ?? unwrapped);
	if (!record) return undefined;
	const lineItems = Array.isArray(record.line_items) ? record.line_items : [];
	return {
		currency: typeof record.currency === "string" ? record.currency : undefined,
		incomingPlans: planIds(record.incoming_plans ?? record.incoming),
		lineFacts: lineItems.map(lineFactsOf).sort(byLineIdentity),
		outgoingPlans: planIds(record.outgoing_plans ?? record.outgoing),
		total:
			asNumber(record.total) ?? asNumber(asRecord(record.due_today)?.total),
	};
};

/** The stored amount recomputed for the current preview's period — a prorated
 * line's period starts at server-now, so its amount decays between computes. */
const decayAdjustedAmount = ({
	current,
	stored,
}: {
	current: LineFacts;
	stored: LineFacts;
}): number | undefined =>
	stored.amount !== undefined &&
	stored.period &&
	current.period &&
	stored.period.end === current.period.end
		? (stored.amount * (current.period.end - current.period.start)) /
			(stored.period.end - stored.period.start)
		: undefined;

/** Total proration decay across matched lines, or undefined when the lines
 * differ in identity or beyond decay — i.e. a real change. */
const lineDecayDelta = ({
	current,
	stored,
}: {
	current: ReadonlyArray<LineFacts>;
	stored: ReadonlyArray<LineFacts>;
}): number | undefined => {
	if (stored.length !== current.length) return undefined;
	let decayDelta = 0;
	for (const [index, storedLine] of stored.entries()) {
		const currentLine = current[index];
		if (!currentLine || storedLine.key !== currentLine.key) return undefined;
		if (storedLine.amount === undefined || currentLine.amount === undefined) {
			if (storedLine.amount !== currentLine.amount) return undefined;
			continue;
		}
		const expected =
			decayAdjustedAmount({ current: currentLine, stored: storedLine }) ??
			storedLine.amount;
		if (Math.abs(currentLine.amount - expected) > CENT_TOLERANCE) {
			return undefined;
		}
		decayDelta += expected - storedLine.amount;
	}
	return decayDelta;
};

const totalWithinDecay = ({
	currentFacts,
	decayDelta,
	storedFacts,
}: {
	currentFacts: MoneyFacts;
	decayDelta: number;
	storedFacts: MoneyFacts;
}): boolean => {
	if (storedFacts.total === undefined || currentFacts.total === undefined) {
		return storedFacts.total === currentFacts.total;
	}
	const tolerance = CENT_TOLERANCE * (storedFacts.lineFacts.length + 1);
	const expected = storedFacts.total + decayDelta;
	return Math.abs(currentFacts.total - expected) <= tolerance;
};

/** Whether the approved money facts still match what would execute — derived
 * facts, not raw payloads, so benign field churn and the server-clock decay of
 * prorated amounts never block approvals. */
export const previewMoneyFactsDrifted = ({
	current,
	stored,
}: {
	current: unknown;
	stored: unknown;
}): { drifted: true; reason: string } | { drifted: false } => {
	const storedFacts = moneyFactsOf(stored);
	const currentFacts = moneyFactsOf(current);
	if (!storedFacts || !currentFacts) return { drifted: false };
	if (
		storedFacts.currency &&
		currentFacts.currency &&
		storedFacts.currency !== currentFacts.currency
	) {
		return { drifted: true, reason: "currency changed" };
	}
	if (
		!samePlanIds({
			current: currentFacts.incomingPlans,
			stored: storedFacts.incomingPlans,
		}) ||
		!samePlanIds({
			current: currentFacts.outgoingPlans,
			stored: storedFacts.outgoingPlans,
		})
	) {
		return { drifted: true, reason: "plan set changed" };
	}
	const decayDelta = lineDecayDelta({
		current: currentFacts.lineFacts,
		stored: storedFacts.lineFacts,
	});
	if (decayDelta === undefined) {
		return { drifted: true, reason: "line items changed" };
	}
	if (!totalWithinDecay({ currentFacts, decayDelta, storedFacts })) {
		return {
			drifted: true,
			reason: `total ${storedFacts.total} → ${currentFacts.total}`,
		};
	}
	return { drifted: false };
};
