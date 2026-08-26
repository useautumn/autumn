import { expect, test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import {
	expectPerCustomerLaneWithRejections,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

type Scenario = Pick<
	Awaited<ReturnType<typeof setupLicenseUpdateScenario>>,
	"ctx" | "autumnV2_3"
>;

const expectExactFallback = async ({
	scenario,
	parentId,
	migrationId,
	code,
}: {
	scenario: Scenario;
	parentId: string;
	migrationId: string;
	code: string;
}) => {
	const { result } = await runVersionRepointMigration({
		ctx: scenario.ctx,
		migrationClient: scenario.autumnV2_3,
		migrationId,
		filter: {
			customer: {
				plan: { plan_id: parentId, version: 1, custom: false },
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: {
						plan_id: parentId,
						version: 1,
						custom: false,
					},
					version: 2,
				},
			],
		},
	});

	expectPerCustomerLaneWithRejections({ result, codes: [code] });
	expect(
		result?.rejections?.map((rejection) => String(rejection.code)),
	).toEqual([code]);
};

test.skip(
	`${chalk.yellowBright("batch version repoint licenses fallback: an added link routes the whole migration")}`,
	async () => {
		const customerId = "bvr-license-fallback-added-customer";
		const stem = "bvr-license-fallback-added";
		const parent = products.base({
			id: `${stem}-parent`,
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: `${stem}-seat`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
			group: `${stem}-seat-group`,
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await scenario.autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			items: [itemsV2.dashboard(), itemsV2.monthlyWords({ included: 25 })],
			licenses: [{ license_plan_id: seat.id, included: 1 }],
			force_version: true,
		});

		await expectExactFallback({
			scenario,
			parentId: parent.id,
			migrationId: `${stem}-migration`,
			code: "license_link_transition",
		});
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint licenses fallback: a removed link routes the whole migration")}`,
	async () => {
		const customerId = "bvr-license-fallback-removed-customer";
		const stem = "bvr-license-fallback-removed";
		const parent = products.base({
			id: `${stem}-parent`,
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: `${stem}-seat`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
			group: `${stem}-seat-group`,
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		await scenario.autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			items: [itemsV2.dashboard(), itemsV2.monthlyWords({ included: 25 })],
			licenses: [],
			force_version: true,
		});

		await expectExactFallback({
			scenario,
			parentId: parent.id,
			migrationId: `${stem}-migration`,
			code: "license_link_transition",
		});
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint licenses fallback: a paid seat-price transition routes the whole migration")}`,
	async () => {
		const customerId = "bvr-license-fallback-price-customer";
		const stem = "bvr-license-fallback-price";
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: stem,
			seatPrice: 20,
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: 1,
			attachedSeats: 3,
		});

		await scenario.autumnV2_3.post("/plans.update", {
			plan_id: scenario.parent.id,
			items: [itemsV2.dashboard(), itemsV2.monthlyWords({ included: 25 })],
			licenses: [
				{
					license_plan_id: scenario.devSeat.id,
					included: 1,
					customize: {
						price: { amount: 30, interval: BillingInterval.Month },
					},
				},
			],
			force_version: true,
		});

		await expectExactFallback({
			scenario,
			parentId: scenario.parent.id,
			migrationId: `${stem}-migration`,
			code: "paid_entitlement_transition",
		});
	},
);
