import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const catalogConfig = ({
	seatPlanId,
	enterprisePlanId,
	includeSeatPlan,
}: {
	seatPlanId: string;
	enterprisePlanId: string;
	includeSeatPlan: boolean;
}): string => `{
	plans: [${
		includeSeatPlan
			? `
		{
			planId: "${seatPlanId}",
			active: true,
			versionSlug: "v1",
			name: "Seat",
			price: { amount: 15, interval: "month" },
			createInStripe: false,
		},`
			: ""
	}
		{
			planId: "${enterprisePlanId}",
			active: true,
			name: "Enterprise",
			versionSlug: "v1",
			price: { amount: 999, interval: "month" },
			licenses: [{ licensePlanId: "${seatPlanId}", versionSlug: "v1", included: 5 }],
			createInStripe: false,
		},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: removing a license plan with assigned seats is refused")}`,
	async () => {
		const seatPlanId = uniqueTestId("atmn_cus_seat_plan");
		const enterprisePlanId = uniqueTestId("atmn_cus_enterprise_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: catalogConfig({
				seatPlanId,
				enterprisePlanId,
				includeSeatPlan: true,
			}),
		});

		try {
			await scenario.push();

			await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: scenario.customerId as unknown as string,
				plan_id: enterprisePlanId,
				license_quantities: [{ license_plan_id: seatPlanId, quantity: 5 }],
			});

			scenario.writeConfig(
				`${atmnImports()}
export default atmn(${catalogConfig({ seatPlanId, enterprisePlanId, includeSeatPlan: false })});
`,
			);

			await expect(scenario.push()).rejects.toThrow(
				new RegExp(enterprisePlanId),
			);
		} finally {
			scenario.cleanup();
		}
	},
);
