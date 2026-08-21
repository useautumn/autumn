import { parsePreviewPayload } from "@autumn/render";

type MoneyFacts = {
	currency?: string;
	incomingPlans: ReadonlyArray<string>;
	lineItemAmounts: ReadonlyArray<number>;
	outgoingPlans: ReadonlyArray<string>;
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

const moneyFactsOf = (preview: unknown): MoneyFacts | undefined => {
	// Stored previews may carry the `{_display, preview}` enrichment wrapper.
	const unwrapped = asRecord(preview)?._display
		? (asRecord(preview)?.preview ?? preview)
		: preview;
	const record = asRecord(parsePreviewPayload(unwrapped) ?? unwrapped);
	if (!record) return undefined;
	const dueToday = asRecord(record.due_today);
	const lineItems = Array.isArray(record.line_items) ? record.line_items : [];
	return {
		currency: typeof record.currency === "string" ? record.currency : undefined,
		incomingPlans: planIds(record.incoming_plans ?? record.incoming),
		lineItemAmounts: lineItems
			.map((item) => asRecord(item)?.amount)
			.filter((amount): amount is number => typeof amount === "number")
			.sort((left, right) => left - right),
		outgoingPlans: planIds(record.outgoing_plans ?? record.outgoing),
		total:
			typeof record.total === "number"
				? record.total
				: typeof dueToday?.total === "number"
					? dueToday.total
					: undefined,
	};
};

/** Whether the money the user approved still matches what would execute now.
 * Comparing derived facts (not raw payloads) keeps benign field churn from
 * blocking approvals. */
export const previewMoneyFactsDrifted = ({
	current,
	stored,
}: {
	current: unknown;
	stored: unknown;
}): { drifted: boolean; reason?: string } => {
	const storedFacts = moneyFactsOf(stored);
	const currentFacts = moneyFactsOf(current);
	if (!storedFacts || !currentFacts) return { drifted: false };
	if (storedFacts.total !== currentFacts.total) {
		return {
			drifted: true,
			reason: `total ${storedFacts.total} → ${currentFacts.total}`,
		};
	}
	if (
		storedFacts.currency &&
		currentFacts.currency &&
		storedFacts.currency !== currentFacts.currency
	) {
		return { drifted: true, reason: "currency changed" };
	}
	if (
		JSON.stringify(storedFacts.lineItemAmounts) !==
		JSON.stringify(currentFacts.lineItemAmounts)
	) {
		return { drifted: true, reason: "line items changed" };
	}
	if (
		JSON.stringify(storedFacts.incomingPlans) !==
			JSON.stringify(currentFacts.incomingPlans) ||
		JSON.stringify(storedFacts.outgoingPlans) !==
			JSON.stringify(currentFacts.outgoingPlans)
	) {
		return { drifted: true, reason: "plan set changed" };
	}
	return { drifted: false };
};
