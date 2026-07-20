import { expect, test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import {
	customerPrices,
	customerProducts,
	productToBasePrice,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService";
import { PriceService } from "@/internal/products/prices/PriceService";
import { generateId } from "@/utils/genUtils";
import {
	expectAssignmentBasePriceAmounts,
	expectAssignmentBasePrices,
	licensePricePatch,
} from "../../utils/basePriceTransitionTestUtils";

test.concurrent(
	`${chalk.yellowBright("base price transition: equivalent physical prices both transition")}`,
	async () => {
		const customerId = "bp-equivalent-prices";
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: "bp-equiv",
			seatPrice: 20,
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: 0,
			attachedSeats: 2,
		});
		await scenario.assignSeats({ count: 2 });
		const assignments = await listLicenseAssignments({
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: scenario.devSeat.id,
			active: true,
		});
		const seatProduct = await ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: scenario.devSeat.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		});
		const basePrice = productToBasePrice({ product: seatProduct });
		if (!basePrice) throw new Error("Expected the seat base price");
		const equivalentPrice = {
			...basePrice,
			id: generateId("price"),
			created_at: Date.now(),
		};
		await PriceService.insert({
			db: scenario.ctx.db,
			data: equivalentPrice,
		});
		await scenario.ctx.db
			.update(customerPrices)
			.set({ price_id: equivalentPrice.id })
			.where(eq(customerPrices.customer_product_id, assignments[0].id));

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			customize: {
				upsert_licenses: licensePricePatch({
					licensePlanId: scenario.devSeat.id,
					amount: 40,
				}),
			},
		};
		const preview =
			await scenario.autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo: scenario.advancedTo,
			oldRecurringTotal: 40,
			newRecurringTotal: 80,
		});
		await scenario.autumnV2_3.billing.update(params);

		await expectAssignmentBasePrices({
			ctx: scenario.ctx,
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: scenario.devSeat.id,
			amount: 40,
			count: 2,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("base price transition: is_custom does not block definition transition")}`,
	async () => {
		const customerId = "bp-custom-assignment";
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: "bp-custom",
			seatPrice: 20,
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: 0,
			attachedSeats: 3,
		});
		await scenario.assignSeats({ count: 3 });
		const assignments = await listLicenseAssignments({
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: scenario.devSeat.id,
			active: true,
		});
		const customAssignment = assignments[0];
		await scenario.ctx.db
			.update(customerProducts)
			.set({ is_custom: true })
			.where(eq(customerProducts.id, customAssignment.id));

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			customize: {
				upsert_licenses: licensePricePatch({
					licensePlanId: scenario.devSeat.id,
					amount: 40,
				}),
			},
		};
		const preview =
			await scenario.autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo: scenario.advancedTo,
			oldRecurringTotal: 60,
			newRecurringTotal: 120,
		});
		await scenario.autumnV2_3.billing.update(params);

		await expectAssignmentBasePriceAmounts({
			ctx: scenario.ctx,
			expected: new Map(assignments.map((assignment) => [assignment.id, 40])),
		});
		const [storedCustomAssignment] = await scenario.ctx.db
			.select({ isCustom: customerProducts.is_custom })
			.from(customerProducts)
			.where(eq(customerProducts.id, customAssignment.id));
		expect(storedCustomAssignment?.isCustom).toBe(true);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId,
		});
	},
);
