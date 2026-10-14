import { expect } from "bun:test";
import { atmnToStripeAmount } from "@autumn/shared";
import type Stripe from "stripe";

type ExpectedPreviewLine = {
	planId?: string;
	featureId?: string | null;
	description?: string;
	total: number;
};

type PreviewLike = {
	total: number;
	line_items: {
		plan_id: string;
		feature_id: string | null;
		description: string;
		total: number;
		period?: { start: number; end: number };
	}[];
};

/** The preview bills exactly these lines, in any order. */
export const expectPreviewLinesCorrect = ({
	preview,
	total,
	lines,
}: {
	preview: PreviewLike;
	total: number;
	lines?: ExpectedPreviewLine[];
}) => {
	expect(preview.total).toBeCloseTo(total, 2);
	if (!lines) return;

	expect(
		preview.line_items,
		`Expected ${lines.length} preview lines`,
	).toHaveLength(lines.length);
	for (const line of lines) {
		const match = preview.line_items.find(
			(previewLine) =>
				(line.planId === undefined || previewLine.plan_id === line.planId) &&
				(line.featureId === undefined ||
					previewLine.feature_id === line.featureId) &&
				(line.description === undefined ||
					previewLine.description === line.description) &&
				Math.abs(previewLine.total - line.total) < 0.01,
		);
		expect(
			match,
			`Expected a preview line ${JSON.stringify(line)}, got ${JSON.stringify(preview.line_items)}`,
		).toBeDefined();
	}
};

/** The Stripe invoice totals `total` over `lineCount` lines, with optional line descriptions. */
export const expectStripeInvoiceLinesCorrect = async ({
	stripeCli,
	stripeInvoiceId,
	total,
	lineCount,
	descriptions,
	periods,
}: {
	stripeCli: Stripe;
	stripeInvoiceId: string;
	total: number;
	lineCount?: number;
	descriptions?: string[];
	periods?: { description: string; startMs: number; endMs: number }[];
}) => {
	const invoice = await stripeCli.invoices.retrieve(stripeInvoiceId, {
		expand: ["lines.data"],
	});
	expect(invoice.total).toBe(
		atmnToStripeAmount({ amount: total, currency: "usd" }),
	);
	if (lineCount !== undefined) {
		expect(invoice.lines.data).toHaveLength(lineCount);
	}
	const lineDescriptions = invoice.lines.data.map((line) => line.description);
	for (const description of descriptions ?? []) {
		expect(lineDescriptions).toContain(description);
	}
	for (const period of periods ?? []) {
		const line = invoice.lines.data.find(
			(invoiceLine) => invoiceLine.description === period.description,
		);
		expect(line?.period).toEqual({
			start: Math.floor(period.startMs / 1000),
			end: Math.floor(period.endMs / 1000),
		});
	}
	return invoice;
};
