import type { ToolCall } from "./context.js";

export const assertNoMinorUnitConversion = ({
	messages,
	actions,
}: {
	messages: Array<{ role: string; content: string }>;
	actions: ToolCall[];
}) => {
	const amounts = new Set<number>();
	for (const { role, content } of messages) {
		if (role !== "user") continue;
		const pattern =
			/(?:\$\s*|\bUSD\s+)(\d[\d,]*(?:\.\d+)?)\s*([km])?\b|\b(\d[\d,]*(?:\.\d+)?)\s*([km])?\s*\/\s*(?:mo(?:nth)?|yr|year)\b/gi;
		for (const match of content.matchAll(pattern)) {
			const number = Number((match[1] ?? match[3]).replaceAll(",", ""));
			const suffix = (match[2] ?? match[4])?.toLowerCase();
			amounts.add(
				number * (suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1),
			);
		}
	}
	const check = (value: unknown, monetary = false): void => {
		if (Array.isArray(value)) {
			for (const child of value) check(child, monetary);
			return;
		}
		if (!value || typeof value !== "object") return;
		for (const [key, child] of Object.entries(value)) {
			if (
				monetary &&
				key === "amount" &&
				typeof child === "number" &&
				child !== 0 &&
				!amounts.has(child) &&
				amounts.has(child / 100)
			)
				throw new Error(
					`Monetary unit error: ${child} is 100 times the requested ${child / 100}. Autumn accepts major currency units; do not convert dollars to cents.`,
				);
			check(child, monetary || key === "price" || key === "custom_line_items");
		}
	};
	for (const action of actions) check(action.args.request);
};
