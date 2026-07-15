import { expect, test } from "bun:test";
import type {
	CheckResponseV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getLicenseDbState } from "./licenseTestUtils.js";

const setupLicense = async ({
	customerId,
	included = 2,
	paidParent = false,
	assignEntityIndex,
}: {
	customerId: string;
	included?: number;
	paidParent?: boolean;
	assignEntityIndex?: number;
}) => {
	const parent = (paidParent ? products.pro : products.base)({
		id: `${customerId}-parent`,
		items: [items.dashboard()],
	});
	const license = products.base({
		id: `${customerId}-license`,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({
				paymentMethod: paidParent ? "success" : undefined,
				testClock: false,
			}),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [parent, license] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: license.id,
				included,
			}),
			s.billing.attach({ productId: parent.id }),
			...(assignEntityIndex === undefined
				? []
				: [
						s.licenses.assign({
							licenseProductId: license.id,
							entityIndex: assignEntityIndex,
						}),
					]),
		],
	});
	return { ...scenario, parent, license };
};

test.concurrent(
	`${chalk.yellowBright("licenses billing: generic cancellation releases an assignment completely")}`,
	async () => {
		const {
			customerId,
			entities,
			autumnV2_2,
			ctx,
			license,
			licenseAssignments: [assignment],
		} = await setupLicense({
			customerId: "lic-generic-cancel",
			included: 1,
			assignEntityIndex: 0,
		});

		expect(
			(
				await autumnV2_2.check<CheckResponseV3>({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
				})
			).allowed,
		).toBe(true);

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: assignment.id,
			cancel_action: "cancel_immediately",
		});

		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(dbState.assignments).toHaveLength(1);
		expect(dbState.assignments[0]).toMatchObject({ status: "expired" });
		expect(dbState.pools).toHaveLength(1);
		expect(dbState.pools[0]).toMatchObject({ granted: 1, remaining: 1 });

		for (const skipCache of [false, true]) {
			const check = await autumnV2_2.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				skip_cache: skipCache,
			});
			expect(check.allowed).toBe(false);
		}
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[1].id,
			plan_id: license.id,
		});
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses billing: concurrent duplicate assignment is idempotent without leaking capacity")}`,
	async () => {
		const { customerId, entities, autumnV2_2, ctx, license } =
			await setupLicense({ customerId: "lic-same-entity-race" });
		const results = await Promise.allSettled(
			[0, 1].map(() =>
				autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entities[0].id,
					plan_id: license.id,
				}),
			),
		);
		const fulfilled = results.filter(
			(result): result is PromiseFulfilledResult<unknown> =>
				result.status === "fulfilled",
		);
		expect(fulfilled).toHaveLength(1);

		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(
			dbState.assignments.filter(({ status }) => status === "active"),
		).toHaveLength(1);
		expect(dbState.pools).toHaveLength(1);
		expect(dbState.pools[0]).toMatchObject({ granted: 2, remaining: 1 });
	},
);
