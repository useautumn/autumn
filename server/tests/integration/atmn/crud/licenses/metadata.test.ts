/**
 * atmn crud/licenses — [metadata]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

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

type CatalogPlanRow = {
	id: string;
	licenses?: Array<{
		licensePlanId: string;
		metadata?: Record<string, unknown>;
	}>;
};

// `plans.licenses.metadata` is a frozen wire path, so this object's keys and
// values pass straight through untouched — no camel/snake recasing.
const METADATA = { tier: "gold", region: "us" };

const enterpriseLicensingSeat = `
		plan({
			planId: "enterprise",
			name: "Enterprise",
			price: { amount: 999, interval: "month" },
			items: [{ featureId: "sso" }, { featureId: "audit_log" }],
			licenses: [{ licensePlanId: "seat", included: 25, metadata: ${JSON.stringify(METADATA)} }],
		}),`;

test.concurrent("license link metadata round-trips untouched", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			features: everyFeatureType,
			plans: `${seatPlan}${enterpriseLicensingSeat}`,
		}),
	});

	try {
		const { freshWire } = await expectRoundTrip({ scenario });

		const catalog = (await scenario.client.get({})) as unknown as {
			plans: CatalogPlanRow[];
		};
		const enterprise = catalog.plans.find((row) => row.id === "enterprise");
		expect(enterprise?.licenses?.[0]?.metadata).toEqual(METADATA);

		const plans = freshWire.plans as Array<Record<string, unknown>>;
		const wireEnterprise = plans.find((row) => row.plan_id === "enterprise");
		const wireLicenses = wireEnterprise?.licenses as Array<
			Record<string, unknown>
		>;
		expect(wireLicenses[0]?.metadata).toEqual(METADATA);
	} finally {
		scenario.cleanup();
	}
});
