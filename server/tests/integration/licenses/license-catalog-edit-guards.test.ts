import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	ErrCode,
	type LicenseBalanceResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeLicenseProduct = ({
	id,
	includedUsage = 25,
}: {
	id: string;
	includedUsage?: number;
}) => ({
	...products.base({
		id,
		items: [items.monthlyMessages({ includedUsage })],
	}),
});

test.concurrent(
	`${chalk.yellowBright("licenses catalog: versioning a license product rolls links and pools forward")}`,
	async () => {
		const parent = products.base({
			id: "lic-rollfwd-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct({ id: "lic-rollfwd-seat" });

		const { customerId, entities, autumnV1, autumnV2_2 } = await initScenario({
			customerId: "lic-version-rollforward",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: license.id,
					entityIndex: 0,
				}),
			],
		});

		await autumnV1.products.update(license.id, {
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[1].id,
			plan_id: license.id,
		})) as { assignment: { entity_id: string; ended_at: number | null } };
		expect(assignment).toMatchObject({
			entity_id: entities[1].id,
			ended_at: null,
		});

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0].inventory).toMatchObject({
			included: 2,
			assigned: 2,
			available: 0,
		});

		const firstEntityCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(firstEntityCheck.allowed).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: link cannot drop capacity below active assignments")}`,
	async () => {
		const parent = products.base({
			id: "lic-cap-guard-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct({ id: "lic-cap-guard-seat" });

		const { autumnV2_2 } = await initScenario({
			customerId: "lic-capacity-guard",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: license.id,
					entityIndex: 0,
				}),
			],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/licenses.link", {
					parent_plan_id: parent.id,
					license_plan_id: license.id,
					included: 0,
				}),
		});
	},
);
