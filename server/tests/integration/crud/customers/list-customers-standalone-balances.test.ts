import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const PLAN_GRANT = 10_000;
const STANDALONE_GRANT = 10_000;

const expectBalanceParityAcrossReadPaths = async ({
	autumnV2_2,
	autumnV2_3,
	customerId,
	featureId,
	granted,
	usage,
	standaloneGrant,
}: {
	autumnV2_2: AutumnInt;
	autumnV2_3: AutumnInt;
	customerId: string;
	featureId: string;
	granted: number;
	usage: number;
	standaloneGrant: number | null;
}) => {
	const fetched = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const rebuilt = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	const offsetPage = (await autumnV2_2.customers.listV2({
		search: customerId,
	})) as { list: ApiCustomerV5[] };
	const cursorPage = (await autumnV2_3.customers.listV2({
		search: customerId,
		limit: 10,
	})) as { list: ApiCustomerV5[] };

	const sources = [
		["customers.get", fetched],
		["customers.get (skip_cache)", rebuilt],
		[
			"customers.list offset (v2.2)",
			offsetPage.list.find((c) => c.id === customerId),
		],
		[
			"customers.list cursor (v2.3)",
			cursorPage.list.find((c) => c.id === customerId),
		],
	] as const;

	for (const [label, customer] of sources) {
		expect(customer, `${label}: customer missing`).toBeDefined();

		const balance = customer?.balances[featureId];
		expect(balance?.granted, `${label}: granted`).toBe(granted);
		expect(balance?.usage, `${label}: usage`).toBe(usage);
		expect(balance?.remaining, `${label}: remaining`).toBe(granted - usage);

		const standaloneItem = balance?.breakdown?.find(
			(item) => item.plan_id === null,
		);

		if (standaloneGrant === null) {
			expect(
				standaloneItem,
				`${label}: drained standalone should be excluded`,
			).toBeUndefined();
			continue;
		}

		expect(
			standaloneItem,
			`${label}: standalone breakdown item missing`,
		).toBeDefined();
		expect(standaloneItem?.included_grant, `${label}: standalone grant`).toBe(
			standaloneGrant,
		);
	}
};

test.concurrent(
	`${chalk.yellowBright("list-customers standalone balances: partially used standalone grant is reported on every read path")}`,
	async () => {
		const customerId = "list-cus-standalone-partial";
		const usage = 500;

		const pro = products.pro({
			id: "pro-standalone-partial",
			items: [items.monthlyMessages({ includedUsage: PLAN_GRANT })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV2_2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: STANDALONE_GRANT,
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage,
		});
		await new Promise((resolve) => setTimeout(resolve, 3000));

		await expectBalanceParityAcrossReadPaths({
			autumnV2_2,
			autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: PLAN_GRANT + STANDALONE_GRANT,
			usage,
			standaloneGrant: STANDALONE_GRANT,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("list-customers standalone balances: fully drained standalone grant is excluded from every read path")}`,
	async () => {
		const customerId = "list-cus-standalone-drained";

		const pro = products.pro({
			id: "pro-standalone-drained",
			items: [items.monthlyMessages({ includedUsage: PLAN_GRANT })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV2_2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: STANDALONE_GRANT,
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: PLAN_GRANT + STANDALONE_GRANT,
		});
		await new Promise((resolve) => setTimeout(resolve, 3000));

		await expectBalanceParityAcrossReadPaths({
			autumnV2_2,
			autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: PLAN_GRANT,
			usage: PLAN_GRANT,
			standaloneGrant: null,
		});
	},
);
