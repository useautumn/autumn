/**
 * atmn crud/referral programs — [max_redemptions null, n] [plan_ids] [exclude_trial]
 *
 * The optional fields of a program, through the full-state config. A config
 * states the whole row, so a field it stops naming is cleared — which is only
 * true if the update reaches the column as SQL NULL.
 *
 * Red (before the fix):
 *  - dropping maxRedemptions left the stored limit in place, because the merge
 *    turned an explicit null into undefined and the update dropped the key
 *
 * Green (after):
 *  - the round trip is stable in both directions: set, clear, set again
 */

import { expect, test } from "bun:test";
import {
	configBody,
	everyFeatureType,
	freePlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	expectPreviewNone,
	expectRoundTrip,
} from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("atmn referral programs: an unstated optional field is cleared")}`,
	async () => {
		const grant = uniqueTestId("atmn_grant");
		const refer = uniqueTestId("atmn_refer");
		const promoCode = grant.replace(/[^a-zA-Z0-9]/g, "");

		const rewards = `
			featureGrant({
				id: "${grant}",
				name: "Beta Credits",
				grants: [{ featureId: "credits", included: 100, expiry: null }],
				promoCodes: [{ code: "${promoCode}", maxUses: 10 }],
			}),`;

		const program = ({ options }: { options: string }) => `
			referralProgram({
				id: "${refer}",
				rewardId: "${grant}",
				redeemOn: "customer_creation",
				receivedBy: "referrer",${options}
			}),`;

		const config = ({ options }: { options: string }) =>
			configBody({
				features: everyFeatureType,
				plans: freePlan,
				rewards,
				referralPrograms: program({ options }),
			});

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: config({
				options: `
				maxRedemptions: 5,
				excludeTrial: true,`,
			}),
		});

		try {
			await scenario.push();
			await expectRoundTrip({ scenario });

			// Dropping both fields from the config clears the stored values.
			scenario.writeConfig(atmnConfigSource({ body: config({ options: "" }) }));
			await scenario.push();

			const cleared = await scenario.client.get({});
			const program0 = cleared.referralPrograms.find(
				(entry) => entry.id === refer,
			);
			expect(program0?.maxRedemptions ?? null).toBeNull();
			expect(program0?.excludeTrial ?? false).toBe(false);

			// And the cleared state is itself stable: no phantom diff.
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});

			// Setting them again moves them back.
			scenario.writeConfig(
				atmnConfigSource({
					body: config({
						options: `
				maxRedemptions: 9,
				excludeTrial: true,`,
					}),
				}),
			);
			await scenario.push();
			const restored = await scenario.client.get({});
			const program1 = restored.referralPrograms.find(
				(entry) => entry.id === refer,
			);
			expect(program1?.maxRedemptions).toBe(9);
			expect(program1?.excludeTrial).toBe(true);
		} finally {
			scenario.cleanup();
		}
	},
	600_000,
);
