import { describe, expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { buildAttachPreviewTotals } from "@/components/forms/attach-v2/utils/buildAttachPreviewTotals";

const NOW = new Date("2026-04-30T10:00:00Z").getTime();
const ONE_DAY = 24 * 60 * 60 * 1000;

const basePreview = (
	overrides?: Partial<AttachPreviewResponse>,
): AttachPreviewResponse =>
	({
		object: "attach_preview",
		customer_id: "cus_123",
		line_items: [],
		subtotal: 20,
		total: 20,
		currency: "usd",
		next_cycle: null,
		incoming: [],
		outgoing: [],
		refund: null,
		redirect_to_checkout: false,
		checkout_type: null,
		...overrides,
	}) as AttachPreviewResponse;

describe("buildAttachPreviewTotals", () => {
	test("returns empty when previewData is null", () => {
		expect(
			buildAttachPreviewTotals({
				previewData: null,
				startDate: null,
				now: NOW,
			}),
		).toEqual([]);
	});

	test("no startDate → 'Total Due Now' only", () => {
		const result = buildAttachPreviewTotals({
			previewData: basePreview(),
			startDate: null,
			now: NOW,
		});

		expect(result).toEqual([
			{ label: "Total Due Now", amount: 20, variant: "primary" },
		]);
	});

	test("no startDate, with next_cycle → adds Next Cycle row with badge", () => {
		const nextStart = NOW + ONE_DAY;
		const result = buildAttachPreviewTotals({
			previewData: basePreview({
				next_cycle: {
					total: 30,
					starts_at: nextStart,
				} as AttachPreviewResponse["next_cycle"],
			}),
			startDate: null,
			now: NOW,
		});

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			label: "Total Due Now",
			amount: 20,
			variant: "primary",
		});
		expect(result[1]?.label).toBe("Next Cycle");
		expect(result[1]?.amount).toBe(30);
		expect(result[1]?.variant).toBe("secondary");
		expect(result[1]?.badge).toBeDefined();
	});

	test("startDate within 1-min tolerance → treated as immediate", () => {
		const result = buildAttachPreviewTotals({
			previewData: basePreview(),
			startDate: NOW + 30_000,
			now: NOW,
		});

		expect(result[0]?.label).toBe("Total Due Now");
		expect(result[0]?.badge).toBeUndefined();
	});

	test("future startDate → single 'Total Due [date]' row, uses next_cycle.total", () => {
		const startDate = NOW + 14 * ONE_DAY;
		const result = buildAttachPreviewTotals({
			previewData: basePreview({
				total: 0,
				next_cycle: {
					total: 20,
					starts_at: startDate,
				} as AttachPreviewResponse["next_cycle"],
			}),
			startDate,
			now: NOW,
		});

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			label: "Total Due May 14, 2026",
			amount: 20,
			variant: "primary",
		});
	});

	test("future startDate without next_cycle → falls back to previewData.total", () => {
		const startDate = NOW + 14 * ONE_DAY;
		const result = buildAttachPreviewTotals({
			previewData: basePreview({ total: 25, next_cycle: null }),
			startDate,
			now: NOW,
		});

		expect(result[0]?.amount).toBe(25);
		expect(result[0]?.label).toBe("Total Due May 14, 2026");
	});

	test("clamps negative totals to 0", () => {
		const startDate = NOW + 14 * ONE_DAY;
		expect(
			buildAttachPreviewTotals({
				previewData: basePreview({
					total: 0,
					next_cycle: {
						total: -10,
						starts_at: startDate,
					} as AttachPreviewResponse["next_cycle"],
				}),
				startDate,
				now: NOW,
			})[0]?.amount,
		).toBe(0);

		expect(
			buildAttachPreviewTotals({
				previewData: basePreview({ total: -5 }),
				startDate: null,
				now: NOW,
			})[0]?.amount,
		).toBe(0);
	});
});
