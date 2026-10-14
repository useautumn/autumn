import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	everyFeatureType,
	seatPlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const enterpriseCustomizedLicense = `
		plan({
			active: true,
			planId: "enterprise",
			name: "Enterprise",
			versionSlug: "v1",
			price: { amount: 999, interval: "month" },
			items: [{ featureId: "sso" }, { featureId: "audit_log" }],
			licenses: [{
				licensePlanId: "seat",
				versionSlug: "v1",
				included: 25,
				customize: { price: { amount: 5, interval: "month" } },
			}],
		}),`;

test.concurrent("customize on a license link round-trips", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			features: everyFeatureType,
			plans: `${seatPlan}${enterpriseCustomizedLicense}`,
		}),
	});

	try {
		const { freshWire } = await expectRoundTrip({ scenario });

		const plans = freshWire.plans as Array<Record<string, unknown>>;
		const wireEnterprise = plans.find((row) => row.plan_id === "enterprise");
		const wireLicenses = wireEnterprise?.licenses as Array<
			Record<string, unknown>
		>;
		expect(wireLicenses[0]?.customize).toEqual(
			expect.objectContaining({
				price: expect.objectContaining({ amount: 5, interval: "month" }),
			}),
		);
	} finally {
		scenario.cleanup();
	}
});
