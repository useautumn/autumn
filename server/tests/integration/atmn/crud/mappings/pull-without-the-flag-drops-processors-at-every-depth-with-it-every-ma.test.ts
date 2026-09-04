/**
 * atmn crud/mappings — pull without the flag drops `processors` at every depth; with it, every mapping round-trips
 *
 * `--include-mappings`
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	initAtmnScenario,
	TMP_ROOT,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { runPull } from "../../../../../../packages/atmn-nightly/src/actions/pull";
import type { AutumnClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

// One plan carrying processors at every depth the CLI can emit them: plan-level
// (stripe product), base-price-level (stripe price), item-price-level (stripe
// price), plus a feature-level mapping.
const proPlan = `
		plan({
			planId: "pro",
			name: "Pro",
			createInStripe: false,
			processors: { stripe: { productId: "prod_fake_depth_plan" } },
			price: {
				amount: 49,
				interval: "month",
				processors: { stripe: { priceId: "price_fake_depth_base" } },
			},
			items: [
				{
					featureId: "seats",
					included: 1,
					price: {
						billingMethod: "prepaid",
						interval: "month",
						amount: 10,
						billingUnits: 1,
						processors: { stripe: { priceId: "price_fake_depth_item" } },
					},
				},
			],
		}),`;
const seatsFeature = `
		feature({
			featureId: "seats",
			name: "Seats",
			type: "metered",
			consumable: false,
			processors: { stripe: { productId: "prod_fake_depth_feature" } },
		}),`;

const pullIntoFreshDir = async ({
	client,
	includeMappings,
}: {
	client: AutumnClient;
	includeMappings: boolean;
}): Promise<string> => {
	const dir = join(TMP_ROOT, uniqueTestId("atmn_mappings_depth"));
	mkdirSync(dir, { recursive: true });
	await runPull({ client, cwd: dir, includeMappings, write: () => {} });
	return dir;
};

test.concurrent(
	"pull drops processors at every depth without the flag, keeps them with it",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ features: seatsFeature, plans: proPlan }),
		});

		try {
			await scenario.push();

			const withoutFlag = await pullIntoFreshDir({
				client: scenario.client,
				includeMappings: false,
			});
			const withFlag = await pullIntoFreshDir({
				client: scenario.client,
				includeMappings: true,
			});

			const wireWithout = (
				await import(`${join(withoutFlag, "autumn.config.ts")}?v=${Date.now()}`)
			).default as Record<string, unknown>;
			const wireWith = (
				await import(`${join(withFlag, "autumn.config.ts")}?v=${Date.now()}`)
			).default as Record<string, unknown>;

			const plansWithout = wireWithout.plans as Array<Record<string, unknown>>;
			const proWithout = plansWithout.find((row) => row.plan_id === "pro");
			expect(proWithout?.processors).toBeUndefined();
			const itemsWithout = proWithout?.items as Array<Record<string, unknown>>;
			expect(
				(itemsWithout[0]?.price as Record<string, unknown>)?.processors,
			).toBeUndefined();
			const featuresWithout = wireWithout.features as Array<
				Record<string, unknown>
			>;
			expect(
				featuresWithout.find((row) => row.feature_id === "seats")?.processors,
			).toBeUndefined();

			const plansWith = wireWith.plans as Array<Record<string, unknown>>;
			const proWith = plansWith.find((row) => row.plan_id === "pro");
			expect(proWith?.processors).toEqual({
				stripe: { product_id: "prod_fake_depth_plan" },
			});
			const priceWith = proWith?.price as Record<string, unknown>;
			expect(priceWith.processors).toEqual({
				stripe: { price_id: "price_fake_depth_base" },
			});
			const itemsWith = proWith?.items as Array<Record<string, unknown>>;
			const itemPriceWith = itemsWith[0]?.price as Record<string, unknown>;
			expect(itemPriceWith.processors).toEqual({
				stripe: { price_id: "price_fake_depth_item" },
			});
			const featuresWith = wireWith.features as Array<Record<string, unknown>>;
			expect(
				featuresWith.find((row) => row.feature_id === "seats")?.processors,
			).toEqual({ stripe: { product_id: "prod_fake_depth_feature" } });
		} finally {
			scenario.cleanup();
		}
	},
);
