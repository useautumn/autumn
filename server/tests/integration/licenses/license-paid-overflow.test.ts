import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("licenses overflow blocked: link with prepaid_only false rejects")}`,
	async () => {
		const parent = products.base({
			id: "ovf-block-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "ovf-block-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-overflow-blocked",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errMessage: "not yet available",
			func: () =>
				autumnV2_2.post("/plans.update", {
					plan_id: parent.id,
					licenses: [
						{ license_plan_id: license.id, included: 1, prepaid_only: false },
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses overflow blocked: attach add_licenses with prepaid_only false rejects")}`,
	async () => {
		const parent = products.base({
			id: "ovf-block-attach-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "ovf-block-attach-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "license-overflow-attach-blocked",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errMessage: "not yet available",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: parent.id,
					customize: {
						add_licenses: [
							{
								license_plan_id: license.id,
								included: 1,
								prepaid_only: false,
							},
						],
					},
				}),
		});
	},
);
