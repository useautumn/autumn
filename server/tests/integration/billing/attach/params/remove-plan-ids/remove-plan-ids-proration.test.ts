import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const legacyPlan = () =>
	products.base({
		id: "legacy-plan",
		group: "legacy",
		items: [
			items.monthlyPrice({ price: 30 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});

const currentPlan = () =>
	products.base({
		id: "current-plan",
		group: "current",
		items: [
			items.monthlyPrice({ price: 50 }),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});

test.concurrent(
	`${chalk.yellowBright("remove-plan-ids proration 1: removed cross-group plan is credited")}`,
	async () => {
		const customerId = "remove-plan-ids-proration-1";
		const legacy = legacyPlan();
		const current = currentPlan();

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [legacy, current] }),
			],
			actions: [
				s.billing.attach({ productId: legacy.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const expectedTotal = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 30,
			newAmount: 50,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: current.id,
			remove_plan_ids: [legacy.id],
		});

		expect(preview.total).toBeCloseTo(expectedTotal, 0);

		const legacyCredit = preview.line_items?.find(
			(lineItem: { plan_id: string; total: number }) =>
				lineItem.plan_id === legacy.id,
		);
		expect(legacyCredit).toBeDefined();
		expect(legacyCredit!.total).toBeLessThan(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: current.id,
			remove_plan_ids: [legacy.id],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [current.id],
			notPresent: [legacy.id],
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: preview.total,
			latestInvoiceProductId: current.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("remove-plan-ids proration 2: billing_behavior none produces no credit")}`,
	async () => {
		const customerId = "remove-plan-ids-proration-2";
		const legacy = legacyPlan();
		const current = currentPlan();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [legacy, current] }),
			],
			actions: [
				s.billing.attach({ productId: legacy.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: current.id,
			remove_plan_ids: [legacy.id],
			billing_behavior: "none",
		});

		expect(preview.line_items ?? []).toHaveLength(0);
		expect(preview.total).toBe(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: current.id,
			remove_plan_ids: [legacy.id],
			billing_behavior: "none",
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [current.id],
			notPresent: [legacy.id],
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 30,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("remove-plan-ids proration 3: a repeated plan id is credited once")}`,
	async () => {
		const customerId = "remove-plan-ids-proration-3";
		const legacy = legacyPlan();
		const current = currentPlan();

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [legacy, current] }),
			],
			actions: [
				s.billing.attach({ productId: legacy.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const expectedTotal = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 30,
			newAmount: 50,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: current.id,
			remove_plan_ids: [legacy.id, legacy.id],
		});

		expect(preview.total).toBeCloseTo(expectedTotal, 0);

		const legacyCredits = (preview.line_items ?? []).filter(
			(lineItem: { plan_id: string }) => lineItem.plan_id === legacy.id,
		);
		expect(legacyCredits).toHaveLength(1);
	},
);
