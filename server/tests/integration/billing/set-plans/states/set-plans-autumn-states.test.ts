/** set_plans rebuilds only the Autumn plans the request governs, leaving add-ons and one-off purchases outside it alone. */

import { test } from "bun:test";
import { ms } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const messagePlans = () => ({
	pro: products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	}),
	premium: products.premium({
		items: [items.monthlyMessages({ includedUsage: 500 })],
	}),
	growth: products.growth({
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	}),
});

test.concurrent(
	`${chalk.yellowBright("set-plans autumn states: add-ons and one-off purchases outside the request are untouched")}`,
	async () => {
		const { pro, premium } = messagePlans();
		const addOn = products.recurringAddOn({ items: [] });
		const oneOffAddOn = products.oneOffAddOn({ items: [] });

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-autumn-addons",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addOn, oneOffAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addOn.id }),
				s.billing.attach({ productId: oneOffAddOn.id }),
			],
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: premium.id }] }],
		});

		await expectCustomerProducts({
			customerId,
			active: [premium.id, addOn.id, oneOffAddOn.id],
			notPresent: [pro.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans autumn states: a scheduled future plan is rebuilt from the request")}`,
	async () => {
		const { pro, premium, growth } = messagePlans();

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-autumn-scheduled",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, growth] }),
			],
			actions: [],
		});
		const nextPhaseStartsAt = advancedTo + ms.days(45);

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{ starts_at: nextPhaseStartsAt, plans: [{ plan_id: premium.id }] },
			],
		});
		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{ starts_at: nextPhaseStartsAt, plans: [{ plan_id: growth.id }] },
			],
		});

		await expectCustomerProducts({
			customerId,
			active: [pro.id],
			scheduled: [growth.id],
			notPresent: [premium.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans autumn states: a canceling plan kept in phase 0 comes back as a clean row")}`,
	async () => {
		const { pro } = messagePlans();

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-autumn-canceling",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
			],
		});
		await expectCustomerProducts({ customerId, canceling: [pro.id] });

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});

		await expectCustomerProducts({ customerId, active: [pro.id] });
	},
);
