/**
 * A check's balance counts only the plans the org's statuses allow: with `include_past_due` off, a past-due plan's
 * grant is left out, as it is left out of the decision.
 *
 * Red (before): the balance worker route counted the past-due plan in `balance` (150, and 50 when it was the only
 *   plan) while deciding on the active plan alone; legacy answered 100, and null.
 * Green (after): both routes answer 100, and null.
 */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	CusProductStatus,
	customerProducts,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

/** An org that renders only active plans; the shared test org counts past-due ones.
 *  Each gets its own owner: concurrent sub-orgs under the default owner race to create the same user. */
const activeOnlyOrg = ({ customerId }: { customerId: string }) =>
	s.platform.create({
		userEmail: `${customerId}@autumn.test`,
		configOverrides: {
			include_past_due: false,
			block_overdue_entitlements: false,
		},
		setupDefaultFeatures: true,
	});

/** Marks one of the customer's plans past due, then drops every cached copy so the next check reads it. */
const setPlanPastDue = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId: string;
}) => {
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const plan = customer.customer_products.find(
		(customerProduct) => customerProduct.product.id === productId,
	);
	if (!plan) throw new Error(`Customer holds no plan ${productId}`);
	await ctx.db
		.update(customerProducts)
		.set({ status: CusProductStatus.PastDue })
		.where(eq(customerProducts.id, plan.id));
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "checkPastDueBalance",
		flushBalances: true,
	});
};

const checkMessages = ({
	autumn,
	customerId,
}: {
	autumn: AutumnInt;
	customerId: string;
}) =>
	autumn.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

test.concurrent(
	`${chalk.yellowBright("check-past-due-balance1: a past-due add-on's grant is left out of the balance")}`,
	async () => {
		const base = products.base({
			id: "past-due-balance-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.base({
			id: "past-due-balance-add-on",
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});
		const customerId = "check-past-due-balance1";
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				activeOnlyOrg({ customerId }),
				s.customer({ testClock: false }),
				s.products({ list: [base, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: base.id }),
				s.billing.attach({ productId: addOn.id }),
			],
		});

		await setPlanPastDue({ ctx, customerId, productId: addOn.id });

		const response = await checkMessages({ autumn: autumnV2_3, customerId });
		expect(response.allowed).toBe(true);
		expect(response.balance?.granted).toBe(100);
		expect(response.balance?.remaining).toBe(100);
	},
);

test.concurrent(
	`${chalk.yellowBright("check-past-due-balance2: a feature granted only by a past-due plan has no balance")}`,
	async () => {
		const addOn = products.base({
			id: "past-due-only-add-on",
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});
		const customerId = "check-past-due-balance2";
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				activeOnlyOrg({ customerId }),
				s.customer({ testClock: false }),
				s.products({ list: [addOn] }),
			],
			actions: [s.billing.attach({ productId: addOn.id })],
		});

		await setPlanPastDue({ ctx, customerId, productId: addOn.id });

		const response = await checkMessages({ autumn: autumnV2_3, customerId });
		expect(response.allowed).toBe(false);
		expect(response.balance).toBeNull();
	},
);
