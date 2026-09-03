import { describe, expect, test } from "bun:test";
import {
	type ApiBalanceBreakdownV1,
	type ApiBalanceV1,
	apiBalanceV1ToIncludedGrant,
	apiBalanceV1ToRecurringGrant,
	ResetInterval,
} from "@autumn/shared";

const breakdown = ({
	included,
	prepaid,
	reset,
}: {
	included: number;
	prepaid: number;
	reset: ApiBalanceBreakdownV1["reset"];
}) =>
	({
		included_grant: included,
		prepaid_grant: prepaid,
		reset,
	}) as ApiBalanceBreakdownV1;

const apiBalance = (items: ApiBalanceBreakdownV1[]) =>
	({ breakdown: items }) as ApiBalanceV1;

describe("apiBalanceV1 grant converters", () => {
	const monthly = breakdown({
		included: 1000,
		prepaid: 200,
		reset: { interval: ResetInterval.Month, resets_at: 0 },
	});
	const oneOff = breakdown({
		included: 50,
		prepaid: 300,
		reset: { interval: ResetInterval.OneOff, resets_at: null },
	});
	const neverResets = breakdown({ included: 25, prepaid: 0, reset: null });

	test("included sums plan allowances across every entry", () => {
		expect(
			apiBalanceV1ToIncludedGrant({
				apiBalance: apiBalance([monthly, oneOff, neverResets]),
			}),
		).toBe(1075);
	});

	test("recurring counts included and prepaid on entries that reset, skipping one-off", () => {
		expect(
			apiBalanceV1ToRecurringGrant({
				apiBalance: apiBalance([monthly, oneOff, neverResets]),
			}),
		).toBe(1200);
	});

	test("both read 0 when there is no breakdown", () => {
		expect(
			apiBalanceV1ToIncludedGrant({ apiBalance: {} as ApiBalanceV1 }),
		).toBe(0);
		expect(
			apiBalanceV1ToRecurringGrant({ apiBalance: {} as ApiBalanceV1 }),
		).toBe(0);
	});
});
