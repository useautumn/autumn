/**
 * atmn crud/variants — a variant that swaps its base's license link via
 * customize.removeLicenses / upsertLicenses round-trips: the get exposes the
 * overlay, an unchanged push previews none, and the links stay put.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { ProductService } from "@/internal/products/ProductService.js";

const creditsItem = `{
	featureId: "credits",
	included: 600,
	pooled: true,
	reset: { interval: "month" },
	rollover: { maxPercentage: 100, expiryDurationType: "month", expiryDurationLength: 1 },
}`;

const config = `{
	features: [
		feature({ featureId: "credits", name: "Credits", type: "metered", consumable: true }),
	],
	plans: [
		plan({
			planId: "seat",
			name: "Seat",
			addOn: true,
			price: { amount: 25, interval: "month" },
			items: [${creditsItem}],
		}),
		plan({
			planId: "seatAnnual",
			name: "Seat (annual)",
			addOn: true,
			price: { amount: 250, interval: "year" },
			items: [${creditsItem}],
		}),
		plan({
			planId: "starter",
			name: "Starter",
			licenses: [{ licensePlanId: "seat", included: 1 }],
		}),
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 49, interval: "month" },
			licenses: [{ licensePlanId: "seat", included: 1 }],
			variants: [
				{
					variantPlanId: "proAnnual",
					name: "Pro (annual)",
					customize: {
						price: { amount: 490, interval: "year" },
						removeLicenses: [{ licensePlanId: "seat" }],
						upsertLicenses: [{ licensePlanId: "seatAnnual", included: 1 }],
					},
				},
			],
		}),
	],
}`;

type Scenario = Awaited<ReturnType<typeof initAtmnScenario>>;

const licenseLinksOf = async ({
	scenario,
	planId,
}: {
	scenario: Scenario;
	planId: string;
}): Promise<Array<{ licensePlanId: string; included: number }>> => {
	const product = await ProductService.getFull({
		db: scenario.ctx.db,
		orgId: scenario.ctx.org.id,
		env: scenario.ctx.env,
		idOrInternalId: planId,
	});
	return (product.licenses ?? []).map((link) => ({
		licensePlanId: link.product.id,
		included: link.included,
	}));
};

const expectLinksUnchanged = async ({
	scenario,
}: {
	scenario: Scenario;
}): Promise<void> => {
	expect(await licenseLinksOf({ scenario, planId: "starter" })).toEqual([
		{ licensePlanId: "seat", included: 1 },
	]);
	expect(await licenseLinksOf({ scenario, planId: "pro" })).toEqual([
		{ licensePlanId: "seat", included: 1 },
	]);
	expect(await licenseLinksOf({ scenario, planId: "proAnnual" })).toEqual([
		{ licensePlanId: "seatAnnual", included: 1 },
	]);
};

test.concurrent(
	"variant customize.removeLicenses / upsertLicenses round-trips",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config,
		});

		try {
			const { freshWire } = await expectRoundTrip({ scenario });
			await expectLinksUnchanged({ scenario });

			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const wirePro = plans.find((row) => row.plan_id === "pro");
			const variants = wirePro?.variants as Array<Record<string, unknown>>;
			expect(variants).toHaveLength(1);
			expect(variants[0].customize).toEqual({
				price: expect.objectContaining({ amount: 490, interval: "year" }),
				remove_licenses: [{ license_plan_id: "seat" }],
				upsert_licenses: [
					expect.objectContaining({
						license_plan_id: "seatAnnual",
						included: 1,
					}),
				],
			});
			expect(plans.some((row) => row.plan_id === "proAnnual")).toBe(false);

			// A second --yes push of the unchanged config must leave every link alone.
			await scenario.push();
			await expectLinksUnchanged({ scenario });
		} finally {
			scenario.cleanup();
		}
	},
);
