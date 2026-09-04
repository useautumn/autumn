/**
 * atmn scenarios/lint — one failing config per rule kind [requiredWhen, forbiddenWhen, mutex, exactlyOne, unique, exists, compare, valueWhen, targetHas] → all collected, nothing sent
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 *
 * forbiddenWhen, mutex, exactlyOne, and compare have no field wired to them in
 * packages/atmn-generator/src/lint/rules/{features,plans}.ts today, so no real
 * config can trip them through the CLI yet (the runtime itself is covered
 * directly, with synthetic rules, by packages/atmn-generator/test/lintRuntime.test.ts).
 * Those four are left as `test.todo` below, naming that gap, rather than
 * faking a violation the registry cannot produce.
 */

import { expect, test } from "bun:test";
import { join } from "node:path";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const CLI_PACKAGE_DIR = join(
	import.meta.dir,
	"../../../../../../packages/atmn-nightly",
);

const configSource = ({ body }: { body: string }): string =>
	`import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";

export default atmn(${body});
`;

/** One config per wired kind, its single violation, and the `because` text
 * that names it — pulled verbatim from the rule definition it trips. */
const WIRED_CASES: Record<
	string,
	{ body: (id: string) => string; because: string }
> = {
	requiredWhen: {
		body: (id) => `{
	features: [
		feature({ featureId: "${id}", name: "Messages", type: "metered" }),
	],
}`,
		because:
			"Omitting it silently creates a non-consumable feature, which never resets.",
	},
	unique: {
		body: (id) => `{
	features: [
		feature({ featureId: "${id}", name: "A", type: "boolean" }),
		feature({ featureId: "${id}", name: "B", type: "boolean" }),
	],
}`,
		because: "Two features claiming one id race to define the same row.",
	},
	exists: {
		body: (id) => `{
	features: [],
	plans: [
		plan({
			planId: "${id}",
			name: "Plan",
			items: [{ featureId: "${id}_missing" }],
		}),
	],
}`,
		because: "A plan item meters a feature this config does not declare.",
	},
	targetHas: {
		body: (id) => `{
	features: [
		feature({ featureId: "${id}", name: "SSO", type: "boolean" }),
	],
	plans: [
		plan({
			planId: "${id}_plan",
			name: "Plan",
			items: [{ featureId: "${id}", featureOverride: { creditSchema: [] } }],
		}),
	],
}`,
		because:
			"featureOverride is only honoured on classic credit-system features.",
	},
	valueWhen: {
		body: (id) => `{
	features: [
		feature({ featureId: "${id}", name: "Seats", type: "metered", consumable: false }),
	],
	plans: [
		plan({
			planId: "${id}_plan",
			name: "Plan",
			price: { amount: 10, interval: "month" },
			items: [
				{
					featureId: "${id}",
					price: {
						billingMethod: "usage_based",
						interval: "month",
						billingUnits: 1,
						tierBehavior: "volume",
						tiers: [{ to: "inf", amount: 1 }],
					},
				},
			],
		}),
	],
}`,
		because: "Volume tiers are prepaid-only.",
	},
};

for (const [kind, testCase] of Object.entries(WIRED_CASES)) {
	test(`one failing config per rule kind [${kind}] → all collected, nothing sent`, async () => {
		const id = uniqueTestId(`atmn_lint_${kind}`);

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: configSource({ body: testCase.body(id) }) },
		});

		try {
			await expect(scenario.push()).rejects.toThrow(testCase.because);

			const catalog = (await scenario.client.get({})) as unknown as {
				features: Array<{ id: string }>;
				plans: Array<{ id: string }>;
			};
			expect(catalog.features.some((row) => row.id === id)).toBe(false);
			expect(catalog.plans.some((row) => row.id === id)).toBe(false);
		} finally {
			scenario.cleanup();
		}
	});
}

test.todo(
	"one failing config per rule kind [forbiddenWhen] → no field wired to it yet, see file header",
	() => {},
);
test.todo(
	"one failing config per rule kind [mutex] → no field wired to it yet, see file header",
	() => {},
);
test.todo(
	"one failing config per rule kind [exactlyOne] → no field wired to it yet, see file header",
	() => {},
);
test.todo(
	"one failing config per rule kind [compare] → no field wired to it yet, see file header",
	() => {},
);

test("one failing config per rule kind: five distinct kinds failing at once are all collected into one throw, nothing sent", async () => {
	const dup = uniqueTestId("atmn_lint_dup");
	const metered = uniqueTestId("atmn_lint_metered");
	const seats = uniqueTestId("atmn_lint_seats");
	const sso = uniqueTestId("atmn_lint_sso");
	const planId = uniqueTestId("atmn_lint_plan");

	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: {
			raw: configSource({
				body: `{
	features: [
		feature({ featureId: "${dup}", name: "Dup 1", type: "boolean" }),
		feature({ featureId: "${dup}", name: "Dup 2", type: "boolean" }),
		feature({ featureId: "${metered}", name: "Messages", type: "metered" }),
		feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
		feature({ featureId: "${sso}", name: "SSO", type: "boolean" }),
	],
	plans: [
		plan({
			planId: "${planId}",
			name: "Plan",
			price: { amount: 10, interval: "month" },
			items: [
				{ featureId: "${planId}_missing" },
				{ featureId: "${sso}", featureOverride: { creditSchema: [] } },
				{
					featureId: "${seats}",
					price: {
						billingMethod: "usage_based",
						interval: "month",
						billingUnits: 1,
						tierBehavior: "volume",
						tiers: [{ to: "inf", amount: 1 }],
					},
				},
			],
		}),
	],
}`,
			}),
		},
	});

	try {
		let thrown: Error | undefined;
		try {
			await scenario.push();
		} catch (error) {
			thrown = error as Error;
		}
		expect(thrown).toBeDefined();
		const message = thrown?.message ?? "";
		for (const because of [
			WIRED_CASES.requiredWhen?.because,
			WIRED_CASES.unique?.because,
			WIRED_CASES.exists?.because,
			WIRED_CASES.targetHas?.because,
			WIRED_CASES.valueWhen?.because,
		]) {
			expect(message).toContain(because);
		}

		const catalog = (await scenario.client.get({})) as unknown as {
			features: Array<{ id: string }>;
			plans: Array<{ id: string }>;
		};
		expect(catalog.plans.some((row) => row.id === planId)).toBe(false);
	} finally {
		scenario.cleanup();
	}
});
