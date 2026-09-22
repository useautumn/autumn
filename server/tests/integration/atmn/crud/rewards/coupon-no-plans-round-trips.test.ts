/**
 * atmn crud/rewards — a coupon that applies to no plans round-trips
 *
 * The server reads three coupon scopes: every plan (`plan_ids: null`), some
 * plans, and none (`plan_ids: []` — the plans it named were archived, or it
 * was never scoped). The write side refused the third, so a pulled config
 * carrying `planIds: []` could not be pushed back, and the only edit that
 * passed lint (`null`) widened a dead coupon to every plan.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"a coupon with planIds: [] applies to no plans and pull → push is zero diff",
	async () => {
		const pro = uniqueTestId("atmn_pro");
		const dead = uniqueTestId("atmn_dead");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
			plans: [
				plan({ active: true, planId: "${pro}", name: "Pro", versionSlug: "v1", price: { amount: 20, interval: "month" } }),
			],
			rewards: [
				coupon({
					id: "${dead}",
					name: "Dead",
					type: "percentage_discount",
					value: 10,
					duration: { type: "one_off", length: null },
					planIds: [],
					promoCodes: [],
				}),
			],
		}`,
		});

		try {
			const { freshFiles } = await expectRoundTrip({ scenario });
			expect(freshFiles.get("rewards.ts")).toContain("planIds: []");

			const catalog = (await scenario.client.get({})) as {
				rewards: { coupon?: { id: string; planIds: string[] | null } }[];
			};
			const row = catalog.rewards.find((r) => r.coupon?.id === dead)?.coupon;
			expect(row?.planIds).toEqual([]);
		} finally {
			scenario.cleanup();
		}
	},
);
