import { expect, test } from "bun:test";
import type { TrackResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { pollRawCusEntBalance } from "./unlimitedDeductionTestUtils.js";

const getInternalCustomerId = async ({
	autumn,
	customerId,
}: {
	autumn: {
		customers: { get: (id: string, params?: object) => Promise<unknown> };
	};
	customerId: string;
}): Promise<string> => {
	const customer = (await autumn.customers.get(customerId, {
		with_autumn_id: true,
	})) as { autumn_id?: string };
	expect(customer.autumn_id).toBeDefined();
	return customer.autumn_id as string;
};

test.concurrent(
	`${chalk.yellowBright("track-unlimited-credits: resident feature deducts credit_cost from unlimited credits cusEnt")}`,
	async () => {
		const customerId = "track-unlim-credits-resident";

		const unlimitedCreditsProd = products.base({
			id: "unlim-credits",
			items: [items.unlimited({ featureId: TestFeature.Credits })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedCreditsProd] }),
			],
			actions: [s.attach({ productId: unlimitedCreditsProd.id })],
		});

		const internalCustomerId = await getInternalCustomerId({
			autumn: autumnV2_3,
			customerId,
		});

		const creditSystem = ctx.features.find((f) => f.id === TestFeature.Credits);
		expect(creditSystem).toBeDefined();

		const trackValue = 5;
		const expectedCreditCost = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditSystem!,
			amount: trackValue,
		});

		const trackRes = (await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: trackValue,
		})) as TrackResponseV3;
		expect(trackRes.customer_id).toBe(customerId);
		expect(trackRes.value).toBe(trackValue);

		const row = await pollRawCusEntBalance({
			internalCustomerId,
			featureId: TestFeature.Credits,
			expectedBalance: -expectedCreditCost,
		});
		expect(row?.unlimited).toBe(true);
		expect(row?.balance).toBe(-expectedCreditCost);
	},
	{ timeout: 90_000 },
);

test.concurrent(
	`${chalk.yellowBright("track-unlimited-credits: tracking the credit feature itself deducts 1:1 from unlimited credits cusEnt")}`,
	async () => {
		const customerId = "track-unlim-credits-toplevel";

		const unlimitedCreditsProd = products.base({
			id: "unlim-credits",
			items: [items.unlimited({ featureId: TestFeature.Credits })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedCreditsProd] }),
			],
			actions: [s.attach({ productId: unlimitedCreditsProd.id })],
		});

		const internalCustomerId = await getInternalCustomerId({
			autumn: autumnV2_3,
			customerId,
		});

		const trackValue = 5;
		const trackRes = (await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: trackValue,
		})) as TrackResponseV3;
		expect(trackRes.customer_id).toBe(customerId);
		expect(trackRes.value).toBe(trackValue);

		const row = await pollRawCusEntBalance({
			internalCustomerId,
			featureId: TestFeature.Credits,
			expectedBalance: -trackValue,
		});
		expect(row?.unlimited).toBe(true);
		expect(row?.balance).toBe(-trackValue);
	},
	{ timeout: 90_000 },
);
