/**
 * invoices.reissue issue_method on an open original.
 *
 * Contract:
 *   open original + "draft"    -> original void now; replacement is a draft that inherits
 *                                 the pending plan; finalizing and paying it later promotes it
 *   open original + "finalize" -> original void; replacement open with auto_advance off
 */

import { expect, test } from "bun:test";
import { ALL_STATUSES, CusProductStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	attachInvoiceModePlan,
	expectIssuedAs,
	type ReissueResponse,
} from "./utils/issueMethodTestUtils";

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: open original + draft → original void, draft replacement still promotes the pending plan")}`,
	async () => {
		const customerId = `inv-issue-open-draft-${Date.now()}`;
		const pro = products.pro({
			id: "pro-issue-open-draft",
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
			finalize: true,
		});

		const { invoice, voided_invoice_id } = (await autumnV2_3.post(
			"/invoices.reissue",
			{ invoice_id: original.id, issue_method: "draft" },
		)) as ReissueResponse;

		expect(voided_invoice_id).toBe(original.id);
		expect(
			(await ctx.stripeCli.invoices.retrieve(original.stripe_id)).status,
		).toBe("void");
		await expectIssuedAs({ invoice, issueMethod: "draft" });

		const findPlan = async () =>
			(
				await CusProductService.list({
					db: ctx.db,
					internalCustomerId: customer?.internal_id ?? "",
					inStatuses: ALL_STATUSES,
				})
			).find((customerProduct) => customerProduct.product.id === pro.id);
		expect((await findPlan())?.status).toBe(CusProductStatus.Pending);

		await autumnV2_3.post("/invoices.finalize", { invoice_id: invoice.id });
		await autumnV2_3.post("/invoices.pay", { invoice_id: invoice.id });
		await new Promise((resolve) => setTimeout(resolve, 12_000));

		expect((await findPlan())?.status).toBe(CusProductStatus.Active);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: open original + finalize → replacement open without auto_advance")}`,
	async () => {
		const customerId = "inv-issue-open-finalize";
		const pro = products.base({
			id: "pro-issue-open-finalize",
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
			finalize: true,
		});

		const { invoice, voided_invoice_id } = (await autumnV2_3.post(
			"/invoices.reissue",
			{ invoice_id: original.id, issue_method: "finalize" },
		)) as ReissueResponse;

		expect(voided_invoice_id).toBe(original.id);
		const replacement = await expectIssuedAs({
			invoice,
			issueMethod: "finalize",
		});
		expect(replacement.total).toBe(2000);
	},
);
