import { expect } from "bun:test";
import type {
	CreateInvoiceParamsInput,
	CreateInvoiceResponse,
	FullProduct,
} from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { ProductService } from "@/internal/products/ProductService";
import type { FuzzExpectation } from "./generateCustomizeScenario";

type Ctx = Awaited<ReturnType<typeof initScenario>>["ctx"];
type Client = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];

const CENT_TOLERANCE = 0.0051;

/** Pricing state of a catalog plan that an invoice must never change. */
export const catalogPricingSnapshot = async ({
	ctx,
	productId,
}: {
	ctx: Ctx;
	productId: string;
}) => {
	const product: FullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return {
		version: product.version,
		prices: [...product.prices].sort((a, b) => a.id.localeCompare(b.id)),
		entitlements: product.entitlements
			.map(({ feature: _feature, ...entitlement }) => entitlement)
			.sort((a, b) => a.id.localeCompare(b.id)),
	};
};

type InvoiceOutcome =
	| { ok: true; response: CreateInvoiceResponse }
	| { ok: false; status: number; code: string; message: string };

/** Posts invoices.create keeping the HTTP status, which the test client drops; any 5xx fails. */
export const postInvoiceCreate = async ({
	autumnV2_3,
	params,
}: {
	autumnV2_3: Client;
	params: CreateInvoiceParamsInput;
}): Promise<InvoiceOutcome> => {
	const response = await fetch(`${autumnV2_3.baseUrl}/invoices.create`, {
		method: "POST",
		headers: autumnV2_3.headers,
		body: JSON.stringify(params),
	});
	const body = await response.json().catch(() => ({}));
	expect(
		response.status,
		`server error: ${body.code} ${body.message}`,
	).toBeLessThan(500);
	if (response.ok) return { ok: true, response: body };
	return {
		ok: false,
		status: response.status,
		code: body.code,
		message: body.message,
	};
};

/** Compares the API outcome with the oracle; amounts must agree to the cent. */
export const expectInvoiceMatchesOracle = ({
	outcome,
	expected,
}: {
	outcome: InvoiceOutcome;
	expected: FuzzExpectation;
}) => {
	if (expected.kind === "invalid") {
		expect(
			outcome.ok,
			`expected 400 (${expected.reason}), got ${
				outcome.ok ? JSON.stringify(outcome.response.preview.lines) : ""
			}`,
		).toBe(false);
		if (outcome.ok) return;
		expect(outcome.status, outcome.message).toBe(400);
		return;
	}

	if (!outcome.ok) {
		throw new Error(
			`expected lines, got ${outcome.status} ${outcome.code}: ${outcome.message}`,
		);
	}
	const { preview } = outcome.response;
	const actual = preview.lines.map((line) => ({
		featureId: line.feature_id,
		amount: line.amount,
		quantity: line.quantity,
		prorated: line.prorated,
	}));
	const message = `\nexpected ${JSON.stringify(expected.lines)}\nactual   ${JSON.stringify(actual)}`;
	expect(actual.length, message).toBe(expected.lines.length);
	expected.lines.forEach((line, index) => {
		const got = actual[index];
		expect(got.featureId, message).toBe(line.featureId);
		expect(got.quantity, message).toBe(line.quantity);
		expect(got.prorated, message).toBe(line.prorated);
		expect(
			Math.abs(got.amount - line.amount),
			`line ${index} amount ${got.amount} vs ${line.amount}${message}`,
		).toBeLessThan(CENT_TOLERANCE);
	});
	expect(
		Math.abs(preview.total - expected.total),
		`total ${preview.total} vs ${expected.total}${message}`,
	).toBeLessThan(CENT_TOLERANCE);
};

/** A created invoice must bill in Stripe exactly what its preview showed, line by line. */
export const expectStripeInvoiceMatchesPreview = async ({
	ctx,
	response,
}: {
	ctx: Ctx;
	response: CreateInvoiceResponse;
}) => {
	const { invoice, preview } = response;
	expect(invoice).not.toBeNull();
	if (!invoice) return;
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		invoice.stripe_id,
	);
	const stripeCents = stripeInvoice.lines.data.map((line) => line.amount);
	const previewCents = preview.lines.map((line) =>
		Math.round(line.amount * 100),
	);
	expect(stripeCents).toEqual(previewCents);
	expect(stripeInvoice.total).toBe(Math.round(preview.total * 100));
	expect(Math.round(invoice.total * 100)).toBe(stripeInvoice.total);
};
