import { expect } from "bun:test";
import { TestFeature } from "../../../../../server/tests/setup/v2Features.js";
import { items } from "../../../../../server/tests/utils/fixtures/items.js";
import { products } from "../../../../../server/tests/utils/fixtures/products.js";
import { initScenario, s } from "../../../../../server/tests/utils/testInitUtils/initScenario.js";
import { fetchPlans } from "../../../src/lib/api/endpoints/index.js";
import { setCliContext } from "../../../src/lib/env/index.js";
import type { AtmnScenario } from "./types.js";

const planId = "pro";

export const basicPlanScenario: AtmnScenario = {
	key: "basic-plan",
	description:
		"Seed a Pro plan in Autumn, then use atmn pull to inspect the generated config.",
	seed: async ({ ctx }) => {
		const pro = products.pro({
			id: planId,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await initScenario({
			ctx,
			setup: [s.products({ list: [pro], prefix: "" })],
			actions: [],
		});

		return { ctx };
	},
	assertPushed: async ({ ctx }) => {
		setCliContext({ local: true, prod: false });
		const plans = await fetchPlans({
			secretKey: ctx.orgSecretKey,
			includeArchived: true,
		});
		const plan = plans.find((remotePlan) => remotePlan.id === planId);

		expect(plan).toBeDefined();
		expect(plan?.name).toContain("Pro");
		expect(plan?.items?.some((item) => item.feature_id === TestFeature.Messages))
			.toBe(true);
	},
};
