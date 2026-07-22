// Red: preview rejects a plan switch that drops assigned licenses.
// Green: preview succeeds and execution releases every assigned seat.
import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import {
	getLicenseDbState,
	listLicenseAssignments,
} from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("license switch: dropped licenses release assigned entities")}`,
	async () => {
		const customerId = "license-switch-release-dropped";
		const group = "license-switch-release-dropped-group";
		const team = products.base({
			id: "license-switch-release-team",
			group,
			items: [items.dashboard()],
		});
		const pro = products.base({
			id: "license-switch-release-pro",
			group,
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "license-switch-release-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [team, pro, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: team.id,
					licenseProductId: seat.id,
					included: 2,
				}),
				s.billing.attach({ productId: team.id }),
				...[0, 1].map((entityIndex) =>
					s.licenses.assign({
						licenseProductId: seat.id,
						entityIndex,
					}),
				),
			],
		});
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			plan_schedule: "immediate",
		};

		await autumnV2_3.billing.previewAttach(params);
		expect(
			await listLicenseAssignments({
				autumn: autumnV2_3,
				customerId,
				active: true,
			}),
		).toHaveLength(2);

		await autumnV2_3.billing.attach(params);
		expect(
			await listLicenseAssignments({
				autumn: autumnV2_3,
				customerId,
				active: true,
			}),
		).toHaveLength(0);
		const { assignments } = await getLicenseDbState({
			db: ctx.db,
			customerId,
		});
		expect(
			assignments.every((assignment) => !assignment.internal_entity_id),
		).toBe(true);
		expect(assignments.every((assignment) => assignment.released_at)).toBe(
			true,
		);
	},
);
