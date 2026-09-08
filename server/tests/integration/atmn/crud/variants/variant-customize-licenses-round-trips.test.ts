/**
 * atmn crud/variants — a variant that swaps its base's license link via
 * customize.removeLicenses / upsertLicenses round-trips: the get exposes the
 * overlay, every push of the config (unchanged, or with an unrelated edit
 * while customers are attached) leaves exactly one link on the variant, and
 * a phantom link already in the DB is repaired by the next push.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	expectPreviewNone,
	expectRoundTrip,
} from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";

const creditsItem = ({ included }: { included: number }) => `{
	featureId: "credits",
	included: ${included},
	pooled: true,
	reset: { interval: "month" },
	rollover: { maxPercentage: 100, expiryDurationType: "month", expiryDurationLength: 1 },
}`;

const config = ({ seatCredits = 600 }: { seatCredits?: number } = {}) => `{
	features: [
		feature({ featureId: "credits", name: "Credits", type: "metered", consumable: true }),
	],
	plans: [
		plan({
			planId: "seat",
			name: "Seat",
			addOn: true,
			price: { amount: 25, interval: "month" },
			items: [${creditsItem({ included: seatCredits })}],
		}),
		plan({
			planId: "seatAnnual",
			name: "Seat (annual)",
			addOn: true,
			price: { amount: 250, interval: "year" },
			items: [${creditsItem({ included: 600 })}],
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

const fullPlan = ({
	scenario,
	planId,
}: {
	scenario: Scenario;
	planId: string;
}) =>
	ProductService.getFull({
		db: scenario.ctx.db,
		orgId: scenario.ctx.org.id,
		env: scenario.ctx.env,
		idOrInternalId: planId,
	});

const licenseLinksOf = async ({
	scenario,
	planId,
}: {
	scenario: Scenario;
	planId: string;
}): Promise<Array<{ licensePlanId: string; included: number }>> => {
	const product = await fullPlan({ scenario, planId });
	return (product.licenses ?? []).map((link) => ({
		licensePlanId: link.product.id,
		included: link.included,
	}));
};

/** starter→seat, pro→seat, proAnnual→seatAnnual — and nothing else. */
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

const setup = () =>
	initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: config(),
	});

test.concurrent(
	"variant customize.removeLicenses / upsertLicenses round-trips",
	async () => {
		const scenario = await setup();

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

test.concurrent(
	"an unrelated in-place edit with customers attached keeps the variant on one link",
	async () => {
		const scenario = await setup();

		try {
			await scenario.push();
			await scenario.seedCustomer({ planId: "pro" });
			await scenario.seedCustomer({ planId: "proAnnual" });
			await scenario.seedCustomer({ planId: "seat" });

			scenario.writeConfig(
				atmnConfigSource({ body: config({ seatCredits: 1000 }) }),
			);
			await scenario.push();
			await expectLinksUnchanged({ scenario });

			const seat = await fullPlan({ scenario, planId: "seat" });
			expect(seat.entitlements[0]?.allowance).toBe(1000);
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	"a phantom base link already on the variant row is removed by the next push",
	async () => {
		const scenario = await setup();

		try {
			await scenario.push();
			const proAnnual = await fullPlan({ scenario, planId: "proAnnual" });
			const seat = await fullPlan({ scenario, planId: "seat" });
			await planLicenseRepo.upsert({
				db: scenario.ctx.db,
				parentInternalProductId: proAnnual.internal_id,
				licenseInternalProductId: seat.internal_id,
				included: 1,
				prepaidOnly: true,
			});
			expect(
				(await licenseLinksOf({ scenario, planId: "proAnnual" })).map(
					(link) => link.licensePlanId,
				),
			).toEqual(expect.arrayContaining(["seat", "seatAnnual"]));

			await scenario.push();
			await expectLinksUnchanged({ scenario });
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		} finally {
			scenario.cleanup();
		}
	},
);
