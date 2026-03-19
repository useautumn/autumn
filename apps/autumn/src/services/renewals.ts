import type { Autumn } from "autumn-js";
import { parseDuration } from "@/utils/formatters";

export type RenewalEntry = {
	customerId: string;
	customerName?: string;
	planName: string;
	planId: string;
	renewsAt: number;
};

export async function findUpcomingRenewals(
	autumn: Autumn,
	period: string,
): Promise<{ renewals: RenewalEntry[]; error?: string }> {
	const durationMs = parseDuration(period);
	if (!durationMs) return { renewals: [], error: `Invalid period: ${period}` };

	const result = await autumn.customers.list({ limit: 100 });

	const now = Date.now();
	const cutoff = now + durationMs;
	const renewals: RenewalEntry[] = [];

	for (const customer of result.list) {
		for (const sub of customer.subscriptions) {
			const periodEnd = sub.currentPeriodEnd;
			if (!periodEnd) continue;

			const renewsAt = typeof periodEnd === "number" ? periodEnd : new Date(periodEnd).getTime();

			if (renewsAt > now && renewsAt <= cutoff) {
				renewals.push({
					customerId: customer.id ?? "",
					customerName: customer.name || undefined,
					planName: sub.plan?.name || sub.planId || "Unknown",
					planId: sub.planId || "",
					renewsAt,
				});
			}
		}
	}

	renewals.sort((a, b) => a.renewsAt - b.renewsAt);
	return { renewals };
}
