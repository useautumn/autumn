import type { ToolCall } from "./context.js";

type RequestedRate = {
	amount: number;
	interval: "month" | "year";
	messageIndex: number;
};
type PriceCheck =
	| { status: "checked"; expected: RequestedRate }
	| { status: "semantic_review"; reason: string };

const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

export const assertExactRequestedBasePrice = ({
	messages,
	actions,
}: {
	messages: Array<{ role: string; content: string }>;
	actions: ToolCall[];
}): PriceCheck => {
	const billing = actions.filter((action) =>
		["attach", "updateSubscription", "createSchedule"].includes(action.name),
	);
	if (billing.length !== 1 || billing[0]?.name === "createSchedule")
		return {
			status: "semantic_review",
			reason:
				"Multiple billing targets or schedule phases cannot be attributed to one literal rate",
		};
	const request = record(billing[0]?.args.request);
	const price = record(record(request.customize).price);
	if (typeof price.amount !== "number" || !Number.isFinite(price.amount))
		return {
			status: "semantic_review",
			reason: "No explicit proposed base-price amount to compare",
		};
	if (
		typeof request.currency === "string" &&
		request.currency.toLowerCase() !== "usd"
	)
		return {
			status: "semantic_review",
			reason: "Dollar notation cannot establish this request's currency",
		};

	let expected: RequestedRate | undefined;
	for (
		let messageIndex = messages.length - 1;
		messageIndex >= 0;
		messageIndex--
	) {
		const message = messages[messageIndex];
		if (!message || message.role !== "user") continue;
		const text = message.content.trim();
		const rates = [
			...text.matchAll(
				/(?:\$\s*|\bUSD\s+|\b)(\d+(?:,\d{3})*(?:\.\d+)?)\s*([km])?\s*(?:\/\s*(mo(?:nth)?|yr|year)\b|(?:per|each|a)\s+(month|year)\b|(monthly|annually|yearly)\b)/gi,
			),
		];
		const priceLanguage =
			/\$|\b(?:USD|price|pricing|cost|rate|discount|free|complimentary|waive|double|triple|half|twice)\b|\d\s*%/i.test(
				text,
			);
		if (!rates.length && !priceLanguage) {
			if (
				/\b(?:attach|upgrade|switch|move|customize|change|set|charge|bill)\b/i.test(
					text,
				)
			)
				return {
					status: "semantic_review",
					reason:
						"A later unpriced action may change the target or terms of an earlier rate",
				};
			continue;
		}
		if (rates.length !== 1)
			return {
				status: "semantic_review",
				reason:
					"Latest pricing instruction does not establish one literal recurring rate",
			};
		if (
			/["“”`]|^\s*>/m.test(text) ||
			/'[^']*(?:\$|USD)[^']*'/i.test(text) ||
			/\b(?:old|previous(?:ly)?|historical|catalog|currently|was|used to|quoted|quote|reference|example|hypothetical|if|would cost|instead of|rather than|discount|percent|percentage|minus|plus|less|times|multiply|multiplied|double|triple|twice|half|increase|decrease|additional|overage|usage|line\s+item|unit\s+price|explain|how|why|whether|said|wrote|prorat(?:e|ed|ion)\s+(?:amount|total)|per\s+(?:seat|contact|credit|token|unit)|billed\s+annually)\b|[%*×÷]|\d\s*[+−-]\s*\d/i.test(
				text,
			)
		)
			return {
				status: "semantic_review",
				reason:
					"Quoted, historical, conditional, unit-based or computed pricing requires semantic attribution",
			};
		if ([...text.matchAll(/\$|\bUSD\b/gi)].length > 1)
			return {
				status: "semantic_review",
				reason: "More than one monetary reference prevents exact attribution",
			};
		if (
			[
				...text.matchAll(
					/\b(?:attach|upgrade|switch|move|charge|bill|set|change|cancel)\b/gi,
				),
			].length > 1
		)
			return {
				status: "semantic_review",
				reason:
					"Multiple requested billing changes need target-specific price attribution",
			};
		const rate = rates[0];
		if (!rate) return { status: "semantic_review", reason: "No literal rate" };
		if (/\$|\bUSD\b/i.test(text) && !/^(?:\$|USD)/i.test(rate[0]))
			return {
				status: "semantic_review",
				reason: "The monetary token could not be parsed completely",
			};
		const earlierPricing = messages
			.slice(0, messageIndex)
			.some(
				(earlier) =>
					earlier.role === "user" &&
					/\$|\bUSD\b|\d\s*[km]?\s*\/\s*(?:mo|month|yr|year)\b/i.test(
						earlier.content,
					),
			);
		if (
			earlierPricing &&
			!/\b(?:actually|correction|instead|(?:change|make|set)\s+(?:it|the\s+(?:base\s+)?price))\b/i.test(
				text,
			)
		)
			return {
				status: "semantic_review",
				reason:
					"Multiple pricing turns are not an explicit correction of one rate",
			};
		const prefix = text.slice(0, rate.index);
		if (
			!/\b(?:set|charge|bill|price|attach|upgrade|switch|move|customiz(?:e|ed)|change|make|use)\b/i.test(
				prefix,
			) ||
			/\b(?:don't|do not|never|not to|shouldn't|should not)\b/i.test(prefix) ||
			/\b(?:seats?|contacts?|credits?|tokens?|units?)\s+(?:to|at|=)\s*$/i.test(
				prefix,
			)
		)
			return {
				status: "semantic_review",
				reason:
					"The literal rate is not an unambiguous affirmative base-price instruction",
			};
		const numeric = Number(rate[1]?.replaceAll(",", ""));
		const suffix = rate[2]?.toLowerCase();
		const period = (rate[3] ?? rate[4] ?? rate[5] ?? "").toLowerCase();
		expected = {
			amount:
				numeric * (suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1),
			interval: period.startsWith("mo") ? "month" : "year",
			messageIndex,
		};
		break;
	}
	if (!expected || !Number.isFinite(expected.amount))
		return {
			status: "semantic_review",
			reason: "No unambiguous user-authored base price was established",
		};
	if (
		price.amount !== expected.amount ||
		price.interval !== expected.interval ||
		(price.interval_count !== undefined && price.interval_count !== 1)
	)
		throw new Error(
			`Requested base-price mismatch: expected ${expected.amount}/${expected.interval} from user message ${expected.messageIndex}, received ${price.amount}/${String(price.interval)}. Preserve the exact user-requested major-unit price; do not rescale or invent it.`,
		);
	return { status: "checked", expected };
};
