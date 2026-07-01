import { afterAll, expect, mock, test } from "bun:test";
import { AppEnv, EntInterval, type FullCusProduct } from "@autumn/shared";
import chalk from "chalk";

// A day-31 Stripe anchor must not push a shorter-month reset into the next month.
// Expected failure without clamping: June 30 becomes July 1.

const MAY_31_2026 = Date.UTC(2026, 4, 31, 15, 13, 9);
const JUST_AFTER_MAY_31_RESET = MAY_31_2026 + 60_000;
const JUNE_30_2026 = Date.UTC(2026, 5, 30, 15, 13, 9);

const realDateNow = Date.now;

mock.module("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		subscriptions: {
			retrieve: async () => ({
				billing_cycle_anchor: Math.floor(MAY_31_2026 / 1000),
			}),
		},
	}),
}));

const { getResetAtUpdate } = await import(
	"@/internal/customers/actions/resetCustomerEntitlements/getResetAtUpdate.js"
);

afterAll(() => {
	Date.now = realDateNow;
});

test(
	`${chalk.yellowBright("month-end reset: Stripe anchor day 31 clamps to June 30")}`,
	async () => {
		Date.now = () => JUST_AFTER_MAY_31_RESET;

		const nextResetAt = await getResetAtUpdate({
			curResetAt: MAY_31_2026,
			interval: EntInterval.Month,
			intervalCount: 1,
			cusProduct: {
				subscription_ids: ["sub_month_end"],
			} as FullCusProduct,
			org: { id: "org_month_end" } as never,
			env: AppEnv.Sandbox,
		});

		expect(nextResetAt).toBe(JUNE_30_2026);
	},
);
