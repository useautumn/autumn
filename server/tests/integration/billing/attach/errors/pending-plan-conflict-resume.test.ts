import { expect, test } from "bun:test";
import { type AttachParamsV1Input, CusProductStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { DEFAULT_CUS_PRODUCT_LIMIT } from "@/internal/misc/edgeConfig/orgLimitsStore";
import {
	expectOnlyOneOpenInvoice,
	initFailedUpgrade,
} from "./utils/pendingPlanConflict";

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 3: a different plan or multi_attach bundle in the same group resumes the original invoice")}`,
	async () => {
		const customerId = "pending-plan-conflict-multi";
		const growth = products.base({
			id: "growth",
			items: [
				items.monthlyMessages({ includedUsage: 1000 }),
				items.monthlyPrice({ price: 150 }),
			],
		});
		const { autumnV2_4, ctx, customer, premium, first } =
			await initFailedUpgrade({ customerId, extraProducts: [growth] });

		const differentPlan = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: growth.id,
		});
		expect(differentPlan.invoice?.stripe_id).toBe(first.invoice?.stripe_id);
		expect(differentPlan.payment_url).toBe(
			differentPlan.invoice?.hosted_invoice_url,
		);

		await autumnV2_4.billing.previewMultiAttach({
			customer_id: customerId,
			plans: [{ plan_id: growth.id }],
		});

		const bundle = await autumnV2_4.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: growth.id }],
		});
		expect(bundle.invoice?.stripe_id).toBe(first.invoice?.stripe_id);
		expect(bundle.payment_url).toBe(bundle.invoice?.hosted_invoice_url);

		await expectOnlyOneOpenInvoice({
			ctx,
			stripeCustomerId: customer?.processor?.id ?? "",
		});

		const pendingRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer?.internal_id ?? "",
			inStatuses: [CusProductStatus.Pending],
		});
		expect(pendingRows.map((row) => row.product.id)).toEqual([premium.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 4: a pending plan beyond the customer snapshot cap still resumes the original invoice")}`,
	async () => {
		const customerId = "pending-plan-conflict-capped";
		const addOns = Array.from({ length: DEFAULT_CUS_PRODUCT_LIMIT }, (_, i) =>
			products.base({
				id: `free-addon-${i}`,
				isAddOn: true,
				items: [items.monthlyCredits({ includedUsage: 1 })],
			}),
		);
		const { autumnV2_4, premium, first } = await initFailedUpgrade({
			customerId,
			extraProducts: addOns,
		});

		for (const addOn of addOns) {
			await autumnV2_4.billing.attach<AttachParamsV1Input>(
				{ customer_id: customerId, plan_id: addOn.id },
				{ timeout: 0 },
			);
		}

		const retry = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(retry.invoice?.stripe_id).toBe(first.invoice?.stripe_id);
	},
);
