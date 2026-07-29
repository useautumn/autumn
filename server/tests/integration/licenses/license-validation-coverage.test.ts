import { expect, test } from "bun:test";
import { type AttachParamsV1Input, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getLicenseDbState } from "./licenseTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("licenses lifecycle: transition to insufficient inherited capacity rejects atomically")}`,
	async () => {
		const group = "license-capacity-transition";
		const source = products.base({
			id: "capacity-transition-source",
			group,
			items: [items.dashboard()],
		});
		const target = products.base({
			id: "capacity-transition-target",
			group,
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "capacity-transition-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "license-capacity-transition",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [source, target, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: source.id,
					licenseProductId: license.id,
					included: 3,
				}),
				s.licenses.link({
					parentProductId: target.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.billing.attach({ productId: source.id }),
				...[0, 1, 2].map((entityIndex) =>
					s.licenses.assign({ licenseProductId: license.id, entityIndex }),
				),
			],
		});
		const before = await getLicenseDbState({ db: ctx.db, customerId });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "active license assignments",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: target.id,
				}),
		});

		const after = await getLicenseDbState({ db: ctx.db, customerId });
		expect(
			after.assignments.map(({ id, status, customer_license_link_id }) => ({
				id,
				status,
				linkId: customer_license_link_id,
			})),
		).toEqual(
			before.assignments.map(({ id, status, customer_license_link_id }) => ({
				id,
				status,
				linkId: customer_license_link_id,
			})),
		);
		expect(after.pools).toEqual(before.pools);
	},
);
