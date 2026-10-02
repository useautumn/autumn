/**
 * set_plans is the full list of the customer's plans in its scope, whatever placed them,
 * and keeps an unchanged plan on its own row when only a phase date moves.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const PHASE_START_TOLERANCE_MS = ms.seconds(1);

const liveRowFor = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
	});
	return fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product_id === productId,
	);
};

test.concurrent(
	`${chalk.yellowBright("set-plans full declaration: an attached add-on left out of the request ends now")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-declare-attached-addon",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addOn.id }),
			],
		});

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});

		await expectCustomerProducts({
			customerId,
			active: [pro.id],
			notPresent: [addOn.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans full declaration: an ongoing plan left out of the request ends now")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-declare-ongoing",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addOn] }),
			],
			actions: [],
		});
		const phases: SetPlansParamsV0Input["phases"] = [
			{ starts_at: "now", plans: [{ plan_id: pro.id }] },
			{
				starts_at: advancedTo + ms.days(30),
				plans: [{ plan_id: premium.id }],
			},
		];

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases,
			unscheduled_plans: [{ plan_id: addOn.id }],
		});
		await expectCustomerProducts({ customerId, active: [pro.id, addOn.id] });

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases,
		});

		await expectCustomerProducts({
			customerId,
			active: [pro.id],
			scheduled: [premium.id],
			notPresent: [addOn.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans full declaration: moving a phase date re-times the running plan on the same row")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-declare-move-phase",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const setPhases = (premiumStartsAt: number) =>
			autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
				customer_id: customerId,
				phases: [
					{ starts_at: "now", plans: [{ plan_id: pro.id }] },
					{ starts_at: premiumStartsAt, plans: [{ plan_id: premium.id }] },
				],
			});

		await setPhases(advancedTo + ms.days(30));
		const proBefore = await liveRowFor({ ctx, customerId, productId: pro.id });

		const movedStartsAt = advancedTo + ms.days(45);
		await setPhases(movedStartsAt);

		const proAfter = await liveRowFor({ ctx, customerId, productId: pro.id });
		const premiumAfter = await liveRowFor({
			ctx,
			customerId,
			productId: premium.id,
		});
		expect(proAfter?.id).toBe(proBefore?.id);
		expect(proAfter?.status).toBe(CusProductStatus.Active);
		expect(
			Math.abs((proAfter?.ended_at ?? 0) - movedStartsAt),
		).toBeLessThanOrEqual(PHASE_START_TOLERANCE_MS);
		expect(premiumAfter?.status).toBe(CusProductStatus.Scheduled);
		expect(
			Math.abs((premiumAfter?.starts_at ?? 0) - movedStartsAt),
		).toBeLessThanOrEqual(PHASE_START_TOLERANCE_MS);
	},
);
