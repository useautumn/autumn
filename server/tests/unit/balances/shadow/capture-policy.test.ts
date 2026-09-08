import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { BalanceObservation } from "@/internal/balances/shadow/balanceObservation.js";
import { prepareBalanceObservation } from "@/internal/balances/shadow/prepareBalanceObservation.js";
import type { DeductionOptions } from "@/internal/balances/utils/types/deductionTypes.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { createCaptureFixture } from "./utils/captureFixture.js";

function createInput() {
	const fixture = createCaptureFixture();
	return {
		fixture,
		input: {
			ctx: { ...fixture.ctx, balanceObservationCapture: fixture.capture },
			fullSubject: fixture.fullSubject,
			deduction: { feature: fixture.feature, deduction: 5 } as FeatureDeduction,
			options: {} as DeductionOptions,
			customerEntitlements: [
				{
					...fixture.customerEntitlement,
					customer_product: fixture.customerProduct,
				},
			],
		},
	};
}

test("capture defaults off and selection is scoped to organization, environment and customer", () => {
	const { fixture, input } = createInput();
	expect(
		prepareBalanceObservation({ ...input, ctx: fixture.ctx }),
	).toBeUndefined();
	expect(prepareBalanceObservation(input)?.params.kind).toBe("deduct");
	for (const ctx of [
		{ ...input.ctx, org: { ...input.ctx.org, id: "other" } },
		{ ...input.ctx, env: AppEnv.Live },
	])
		expect(prepareBalanceObservation({ ...input, ctx })).toBeUndefined();
	expect(
		prepareBalanceObservation({
			...input,
			fullSubject: { ...input.fullSubject, customerId: "other" },
		}),
	).toBeUndefined();
	input.ctx.balanceObservationCapture.select = () => {
		throw new Error("bad policy");
	};
	expect(prepareBalanceObservation(input)).toBeUndefined();
	expect(fixture.failures).toEqual(["capture_policy_failed"]);
});

test("unsupported operations retain their kind and selected mutations never become skips", () => {
	const { input } = createInput();
	const cases: [
		Partial<FeatureDeduction>,
		DeductionOptions,
		BalanceObservation["kind"],
	][] = [
		[{ deduction: -5 }, {}, "refund"],
		[{ targetBalance: 20 }, {}, "set"],
		[{}, { alterGrantedBalance: true }, "adjust"],
		[{ lock: { enabled: true, lock_id: "reserve" } }, {}, "reserve"],
		[{ lockReceiptKey: "lock", unwindValue: 0 }, {}, "finalize"],
		[{ lockReceiptKey: "lock", unwindValue: 5 }, {}, "unwind"],
		[{}, { eventProperties: { region: "uk" } }, "unsupported"],
	];
	for (const [deduction, options, kind] of cases)
		expect(
			prepareBalanceObservation({
				...input,
				deduction: { ...input.deduction, ...deduction },
				options,
			})?.params.kind,
		).toBe(kind);
	const excluded = {
		...input,
		deduction: {
			...input.deduction,
			feature: { ...input.deduction.feature, id: "excluded" },
		},
	};
	expect(prepareBalanceObservation(excluded)?.params).toMatchObject({
		kind: "unsupported",
		reason: "excluded_operation_affects_selected_feature",
	});
	expect(
		prepareBalanceObservation({ ...excluded, customerEntitlements: [] })?.params
			.kind,
	).toBe("skip");
});

test("unsupported balance shapes are classified rather than thrown into the live path", () => {
	for (const [field, value, reason] of [
		["balance", -1, "negative_balance_not_supported"],
		["usage_allowed", true, "overage_not_supported"],
		["unlimited", true, "unlimited_not_supported"],
		["next_reset_at", 1, "reset_due"],
	] as const) {
		const { input } = createInput();
		Object.assign(input.customerEntitlements[0], { [field]: value });
		expect(prepareBalanceObservation(input)?.params).toMatchObject({
			kind: "unsupported",
			reason,
		});
	}
});
