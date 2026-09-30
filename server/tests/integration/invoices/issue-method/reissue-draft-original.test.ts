/**
 * invoices.reissue on a draft original. Stripe can't void a draft, so it is parked:
 * left as a draft with auto_advance off and stamped as reissued.
 *
 * Contract:
 *   draft original      -> stays draft, auto_advance off (even if it was on), stamped
 *                          autumn_reissued_to; voided_invoice_id is null
 *                       -> the pending plan's pointer moves to the replacement
 *   stamped original    -> invoices.finalize and invoices.pay reject it
 *   issue_method        -> replacement is sent (default) or left as a draft
 */

import { expect, test } from "bun:test";
import { ALL_STATUSES, CusProductStatus, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";
import {
	attachInvoiceModePlan,
	expectIssuedAs,
	type ReissueResponse,
} from "./utils/issueMethodTestUtils";

const expectOriginalParked = async ({
	stripeInvoiceId,
	replacementStripeId,
}: {
	stripeInvoiceId: string;
	replacementStripeId: string;
}) => {
	const original = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	expect(original.status).toBe("draft");
	expect(original.auto_advance).toBe(false);
	expect(original.metadata?.autumn_reissued_to).toBe(replacementStripeId);
};

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: draft original → parked with auto_advance off, pending plan moves to the sent replacement")}`,
	async () => {
		const customerId = `inv-issue-draft-original-${Date.now()}`;
		const pro = products.pro({
			id: "pro-issue-draft-original",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, autumnV2_4, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		const original = await attachInvoiceModePlan({
			autumnV2_3,
			autumnV2_4,
			customerId,
			planId: pro.id,
			finalize: false,
		});
		expect(original.status).toBe("draft");
		// Renewal drafts advance on their own; the reissue must stop that.
		await ctx.stripeCli.invoices.update(original.stripe_id, {
			auto_advance: true,
		});

		const pending = (
			await CusProductService.list({
				db: ctx.db,
				internalCustomerId: customer?.internal_id ?? "",
				inStatuses: ALL_STATUSES,
			})
		).find((customerProduct) => customerProduct.product.id === pro.id);
		expect(pending?.status).toBe(CusProductStatus.Pending);

		const { invoice, voided_invoice_id } = (await autumnV2_3.post(
			"/invoices.reissue",
			{ invoice_id: original.id },
		)) as ReissueResponse;

		expect(voided_invoice_id).toBeNull();
		await expectOriginalParked({
			stripeInvoiceId: original.stripe_id,
			replacementStripeId: invoice.stripe_id,
		});
		await expectIssuedAs({ invoice, issueMethod: "send" });

		const metadata = await MetadataService.get({
			db: ctx.db,
			id: pending?.metadata_id ?? "",
		});
		expect(metadata?.stripe_invoice_id).toBe(invoice.stripe_id);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: draft original + draft → replacement draft, original can't be finalized or paid")}`,
	async () => {
		const customerId = "inv-issue-draft-original-guard";
		const pro = products.base({
			id: "pro-issue-draft-original-guard",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		const original = await attachInvoiceModePlan({
			autumnV2_3,
			autumnV2_4,
			customerId,
			planId: pro.id,
			finalize: false,
		});

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			issue_method: "draft",
		})) as ReissueResponse;

		await expectOriginalParked({
			stripeInvoiceId: original.stripe_id,
			replacementStripeId: invoice.stripe_id,
		});
		await expectIssuedAs({ invoice, issueMethod: "draft" });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.post("/invoices.finalize", { invoice_id: original.id }),
		});
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () => autumnV2_3.post("/invoices.pay", { invoice_id: original.id }),
		});
		expect(
			(await ctx.stripeCli.invoices.retrieve(original.stripe_id)).status,
		).toBe("draft");
	},
);
