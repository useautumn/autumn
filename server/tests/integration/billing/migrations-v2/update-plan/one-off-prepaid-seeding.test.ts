/**
 * Bloom incident (rows created Sep 1–4 2026): a plan with a recurring prepaid
 * and a one-off prepaid on the same feature seeded the one-off cusEnt with the
 * recurring prepaid quantity, because options are feature-keyed.
 *
 * Red-failure mode (before PR #3243, prod builds up to d42d6775):
 *  - one-off cusEnt balance == purchased quantity (duplicate credits)
 *
 * Green-success criteria (PR #3243, first prod build 0a102cfe on Sep 4 17:32 UTC):
 *  - one-off cusEnt balance == 0, recurring cusEnt balance == purchased quantity
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type FullCusProduct,
	isOneOffPrice,
	type LimitedItem,
	TierBehavior,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";

const PURCHASED_QUANTITY = 300;

const MONTHLY_TIERS = [
	{ to: 300, amount: 0, flat_amount: 66 },
	{ to: 500, amount: 0, flat_amount: 100 },
	{ to: 1000, amount: 0, flat_amount: 180 },
	{ to: "inf" as const, amount: 0, flat_amount: 340 },
];

const ONE_OFF_TIERS = [
	{ to: 75, amount: 0.22 },
	{ to: 125, amount: 0.2 },
	{ to: 250, amount: 0.18 },
	{ to: "inf" as const, amount: 0.17 },
];

const splitPrepaidCusEnts = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const pairs = cusProduct.customer_entitlements
		.filter((cusEnt) => cusEnt.entitlement.feature.id === TestFeature.Credits)
		.map((cusEnt) => ({
			cusEnt,
			cusPrice: getRelatedCusPrice(cusEnt, cusProduct.customer_prices),
		}))
		.filter((pair) => pair.cusPrice !== undefined);
	return {
		oneOff: pairs.find((pair) => isOneOffPrice(pair.cusPrice!.price))?.cusEnt,
		recurring: pairs.find((pair) => !isOneOffPrice(pair.cusPrice!.price))
			?.cusEnt,
	};
};

test.concurrent(
	`${chalk.yellowBright("one-off prepaid seeding: attach with feature_quantities must not seed the one-off sibling")}`,
	async () => {
		const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const customerId = `one-off-seeding-${suffix}`;
		const plan = products.pro({
			id: `scale-seed-${suffix}`,
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Credits,
					tiers: MONTHLY_TIERS,
					tierBehaviour: TierBehavior.VolumeBased,
					billingUnits: 1,
					includedUsage: 0,
				}) as LimitedItem,
				constructPrepaidItem({
					featureId: TestFeature.Credits,
					tiers: ONE_OFF_TIERS,
					tierBehaviour: TierBehavior.VolumeBased,
					billingUnits: 1,
					includedUsage: 0,
					isOneOff: true,
				}) as LimitedItem,
			],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [
						{ feature_id: TestFeature.Credits, quantity: PURCHASED_QUANTITY },
					],
				}),
			],
		});

		const full = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const cusProduct = full.customer_products.find(
			(candidate) =>
				candidate.product_id === plan.id && candidate.status === "active",
		)!;
		const { oneOff, recurring } = splitPrepaidCusEnts({ cusProduct });
		console.log("seeded balances", {
			options: cusProduct.options,
			recurring: { id: recurring?.id, balance: recurring?.balance },
			oneOff: { id: oneOff?.id, balance: oneOff?.balance },
		});

		expect(recurring?.balance).toBe(PURCHASED_QUANTITY);
		expect(oneOff?.balance).toBe(0);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Credits,
			remaining: PURCHASED_QUANTITY,
		});
	},
);
