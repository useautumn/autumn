/** Contract: omitted quantities carry paid seats across a license transition.
 * Assignment customer-product IDs stay stable and repoint to the incoming plan. */

import { expect, test } from "bun:test";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";
import {
	completeImmediateItemTransition,
	ITEM_TRANSITION_ENTITY_COUNT,
	setupItemTransitionScenario,
} from "../utils/itemTransitionTestUtils";

test.concurrent(
	`${chalk.yellowBright("license seat transition: repoints existing assignment customer-products")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-seat-product-transition",
			fromItems: [],
			toItems: [],
		});
		const before = await getLicenseDbState({
			db: scenario.ctx.db,
			customerId: scenario.customerId,
		});
		const assignmentIds = before.assignments.map(({ id }) => id).sort();
		const incomingProduct = await ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: scenario.toSeat.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		});

		await completeImmediateItemTransition({ scenario });

		const after = await getLicenseDbState({
			db: scenario.ctx.db,
			customerId: scenario.customerId,
		});
		expect(after.assignments).toHaveLength(ITEM_TRANSITION_ENTITY_COUNT);
		expect(after.assignments.map(({ id }) => id).sort()).toEqual(assignmentIds);
		for (const assignment of after.assignments) {
			expect(assignment.internal_product_id).toBe(incomingProduct.internal_id);
		}
	},
);
