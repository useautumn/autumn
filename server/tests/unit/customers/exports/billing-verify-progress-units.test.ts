/**
 * Progress counted every walked row, but verification only touches customers
 * holding a Stripe-linked plan — under 4% of a large org, and concentrated in
 * the oldest customers the walk reaches last. The bar therefore raced to nearly
 * complete through the sparse middle and then crawled through most of the work.
 *
 * The numerator and denominator have to measure the same thing, so the stream
 * reports a candidateCount and streamCustomerExportCsv prefers it.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourceOf = (relativePath: string) =>
	readFileSync(
		join(
			import.meta.dir,
			"../../../../src/internal/customers/exports",
			relativePath,
		),
		"utf8",
	);

describe("billing verify progress units", () => {
	it("reports the candidates a page verified, not every row walked", () => {
		const stream = sourceOf(
			"workflows/upload/createBillingVerifyExportRowStream.ts",
		);

		expect(stream).toContain("candidateCount: batch.length");
	});

	it("advances progress by candidates whenever a kind reports them", () => {
		const stream = sourceOf("workflows/upload/streamCustomerExportCsv.ts");

		expect(stream).toContain("page.candidateCount ?? page.customerCount");
	});

	it("counts the same population for the denominator", () => {
		const upload = sourceOf("workflows/upload/uploadCustomerExportCsv.ts");

		expect(upload).toContain("countStripeLinkedCustomers");
		expect(upload).toContain("CustomerExportKind.BillingVerify");
	});

	it("leaves the plain customer export counting rows", () => {
		const stream = sourceOf(
			"workflows/upload/createCustomerExportRowStream.ts",
		);

		expect(stream).not.toContain("candidateCount");
	});
});
