/**
 * Finalizing the invoice of a pending plan that was edited without a new payment.
 *
 * Red (before): the edit swapped the pending row for a replacement that took over the payment,
 * but the deferred plan still named the old row, so invoice.finalized re-inserted it and failed
 * with a customer_products_pkey violation, leaving the plan pending.
 * Green (after): finalizing activates the replacement row with the edited items.
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV3,
	type ApiListInvoiceV1,
	type AttachParamsV1Input,
	CusProductStatus,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

test.concurrent(
	`${chalk.yellowBright("pending plan edit: finalizing the draft activates the edited replacement row")}`,
	async () => {
		const customerId = "pending-edit-draft-finalize";
		const pro = products.base({
			id: "pro-pending-edit-draft-finalize",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});
		const { autumnV1, autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const listPlanRows = async () =>
			(
				await CusProductService.list({
					db: ctx.db,
					internalCustomerId: customer?.internal_id ?? "",
					inStatuses: ALL_STATUSES,
				})
			).filter((customerProduct) => customerProduct.product.id === pro.id);

		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: {
				enabled: true,
				finalize: false,
				enable_plan_immediately: true,
			},
		});
		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as { list: ApiListInvoiceV1[] };
		const draft = list[0];
		expect(draft.status).toBe("draft");
		const [original] = await listPlanRows();
		expect(original.status).toBe(CusProductStatus.Pending);

		await autumnV2_4.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: original.id,
			customize: { items: [itemsV2.monthlyMessages({ included: 200 })] },
		});
		const replacement = (await listPlanRows()).find(
			(customerProduct) => customerProduct.status === CusProductStatus.Pending,
		);
		expect(replacement?.id).not.toBe(original.id);
		expect(replacement?.metadata_id).toBe(original.metadata_id);

		await ctx.stripeCli.invoices.finalizeInvoice(draft.stripe_id);

		await expectProductActive({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			productId: pro.id,
		});
		const activeRows = (await listPlanRows()).filter(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		expect(activeRows.map(({ id }) => id)).toEqual([replacement?.id ?? ""]);
		await pollUntilAsserted({
			fetch: () =>
				MetadataService.get({ db: ctx.db, id: original.metadata_id ?? "" }),
			assert: (metadata) => expect(metadata).toBeFalsy(),
		});
		expectCustomerFeatureCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			featureId: TestFeature.Messages,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});
	},
);
