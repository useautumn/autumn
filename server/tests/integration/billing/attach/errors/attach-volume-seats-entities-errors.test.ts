import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("volume seats on entities: attaching to a second entity returns 400")}`,
	async () => {
		const customerId = "volume-seats-two-entities";
		const seats = products.pro({
			id: "volume-seats-entities",
			items: [items.volumeAllocated({ featureId: TestFeature.Workflows })],
		});

		const { autumnV2_3, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [seats] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: seats.id, entityIndex: 0 })],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Volume-priced seats can't be attached to more than one entity yet",
			func: () =>
				autumnV2_3.billing.attach({
					customer_id: customerId,
					plan_id: seats.id,
					entity_id: entities[1].id,
				}),
		});
	},
);
