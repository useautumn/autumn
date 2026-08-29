import { parsePreviewPayload } from "@autumn/render";

/** Covers float error plus 2dp rounding on otherwise-exact decay math. */
const DECAY_TOLERANCE = 0.011;

type LineFact = {
	amount: number;
	key: string;
	period?: { end: number; start: number };
};

type MoneyFacts = {
	capturedAt?: number;
	currency?: string;
	incomingPlans: ReadonlyArray<string>;
	lines: ReadonlyArray<LineFact>;
	outgoingPlans: ReadonlyArray<string>;
	taxTotal: number;
	total?: number;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const planIds = (value: unknown): string[] =>
	Array.isArray(value)
		? value
				.map((entry) => asRecord(entry)?.plan_id ?? asRecord(entry)?.id)
				.filter((id): id is string => typeof id === "string")
				.sort()
		: [];

const lineFactOf = (item: unknown): LineFact | undefined => {
	const record = asRecord(item);
	const amount =
		typeof record?.total === "number"
			? record.total
			: typeof record?.amount === "number"
				? record.amount
				: undefined;
	if (!record || amount === undefined) return undefined;
	const period = asRecord(record.period);
	const start = typeof period?.start === "number" ? period.start : undefined;
	const end = typeof period?.end === "number" ? period.end : undefined;
	return {
		amount,
		key: [
			record.plan_id ?? record.price_id,
			record.feature_id,
			record.quantity,
			record.display_name ?? record.description,
			end,
		]
			.map((part) => String(part ?? ""))
			.join("|"),
		...(start !== undefined && end !== undefined
			? { period: { end, start } }
			: {}),
	};
};

const moneyFactsOf = (preview: unknown): MoneyFacts | undefined => {
	const outer = asRecord(preview);
	const capturedAt =
		typeof outer?._captured_at === "number" ? outer._captured_at : undefined;
	const wrapped =
		outer?.preview !== undefined &&
		(outer._display !== undefined || capturedAt !== undefined);
	const unwrapped = wrapped ? outer.preview : preview;
	const record = asRecord(parsePreviewPayload(unwrapped) ?? unwrapped);
	if (!record) return undefined;
	const dueToday = asRecord(record.due_today);
	const lineItems = Array.isArray(record.line_items) ? record.line_items : [];
	const taxTotal = asRecord(record.tax)?.total;
	return {
		capturedAt,
		currency: typeof record.currency === "string" ? record.currency : undefined,
		incomingPlans: planIds(record.incoming_plans ?? record.incoming),
		lines: lineItems
			.map(lineFactOf)
			.filter((line): line is LineFact => line !== undefined),
		outgoingPlans: planIds(record.outgoing_plans ?? record.outgoing),
		taxTotal: typeof taxTotal === "number" ? taxTotal : 0,
		total:
			typeof record.total === "number"
				? record.total
				: typeof dueToday?.total === "number"
					? dueToday.total
					: undefined,
	};
};

/** Prorated amounts decay with wall clock: amount = full × (end − now)/(end − start),
 * where an in-advance line's period.start is the server-now of its own compute. A
 * matched pair therefore satisfies an exact identity; anything else is real drift. */
const decayMatched = ({
	capturedAt,
	current,
	stored,
}: {
	capturedAt?: number;
	current: LineFact;
	stored: LineFact;
}): boolean => {
	if (!stored.period || !current.period) return false;
	if (stored.period.end !== current.period.end) return false;
	if (current.period.start < stored.period.start) return false;
	if (stored.period.end <= stored.period.start) return false;
	const startMoved = current.period.start > stored.period.start;
	const reference = startMoved ? stored.period.start : capturedAt;
	if (reference === undefined) return false;
	const nowReference = startMoved ? current.period.start : Date.now();
	const expected =
		(stored.amount * (stored.period.end - nowReference)) /
		(stored.period.end - reference);
	const sameDirection =
		current.amount === 0 ||
		Math.sign(current.amount) === Math.sign(stored.amount);
	return (
		sameDirection && Math.abs(current.amount - expected) <= DECAY_TOLERANCE
	);
};

const pairLines = (
	stored: ReadonlyArray<LineFact>,
	current: ReadonlyArray<LineFact>,
): ReadonlyArray<[LineFact, LineFact]> | undefined => {
	const byKey = (lines: ReadonlyArray<LineFact>) => {
		const groups = new Map<string, LineFact[]>();
		for (const line of lines) {
			groups.set(line.key, [...(groups.get(line.key) ?? []), line]);
		}
		for (const group of groups.values()) {
			group.sort((left, right) => right.amount - left.amount);
		}
		return groups;
	};
	const storedGroups = byKey(stored);
	const currentGroups = byKey(current);
	if (storedGroups.size !== currentGroups.size) return undefined;
	const pairs: [LineFact, LineFact][] = [];
	for (const [key, storedGroup] of storedGroups) {
		const currentGroup = currentGroups.get(key);
		if (!currentGroup || currentGroup.length !== storedGroup.length) {
			return undefined;
		}
		for (const [index, storedLine] of storedGroup.entries()) {
			pairs.push([storedLine, currentGroup[index]]);
		}
	}
	return pairs;
};

/** Whether the approved money facts still match what would execute — derived
 * facts, not raw payloads, so benign churn (including proration time-decay)
 * never blocks approvals while real price changes still do. */
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
		JSON.stringify(storedFacts.incomingPlans) !==
			JSON.stringify(currentFacts.incomingPlans) ||
		JSON.stringify(storedFacts.outgoingPlans) !==
			JSON.stringify(currentFacts.outgoingPlans)
	) {
		return { drifted: true, reason: "plan set changed" };
	}
	const pairs = pairLines(storedFacts.lines, currentFacts.lines);
	if (!pairs) return { drifted: true, reason: "line items changed" };
	let movedPairs = 0;
	for (const [storedLine, currentLine] of pairs) {
		if (currentLine.amount === storedLine.amount) continue;
		movedPairs += 1;
		const bothProrated = Boolean(storedLine.period && currentLine.period);
		if (
			bothProrated &&
			Math.abs(currentLine.amount - storedLine.amount) <= DECAY_TOLERANCE
		) {
			continue;
		}
		if (
			decayMatched({
				capturedAt: storedFacts.capturedAt,
				current: currentLine,
				stored: storedLine,
			})
		) {
			continue;
		}
		return { drifted: true, reason: "line items changed" };
	}
	if (
		(storedFacts.total === undefined) !==
		(currentFacts.total === undefined)
	) {
		return {
			drifted: true,
			reason: `total ${storedFacts.total} → ${currentFacts.total}`,
		};
	}
	if (storedFacts.total !== undefined && currentFacts.total !== undefined) {
		const lineDelta = pairs.reduce(
			(sum, [storedLine, currentLine]) =>
				sum + currentLine.amount - storedLine.amount,
			0,
		);
		const taxDelta = currentFacts.taxTotal - storedFacts.taxTotal;
		const nothingMoved = movedPairs === 0 && taxDelta === 0;
		const expected = storedFacts.total + lineDelta + taxDelta;
		const matches = nothingMoved
			? currentFacts.total === storedFacts.total
			: Math.abs(currentFacts.total - expected) <=
				DECAY_TOLERANCE * (movedPairs + 1);
		if (!matches) {
			return {
				drifted: true,
				reason: `total ${storedFacts.total} → ${currentFacts.total}`,
			};
		}
	}
	return { drifted: false };
};
