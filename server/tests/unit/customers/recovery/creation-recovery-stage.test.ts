/**
 * The customer creation recovery stage lives on `ctx.state`, the request's typed state, not in
 * the log payload.
 *
 * Contract under test:
 * - Setting the stage writes `ctx.state.customerCreationRecoveryStage` and leaves `ctx.extraLogs` untouched.
 * - Reading an unset or unknown stage gives `lookup`; the narrowing lives in the accessor.
 */

import { describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getCustomerCreationRecoveryStage,
	setCustomerCreationRecoveryStage,
} from "@/internal/customers/recovery/customerCreationRecoveryStage.js";

const buildContext = () =>
	({ extraLogs: {}, state: {} }) as unknown as AutumnContext;

describe("customer creation recovery stage", () => {
	test("starts at lookup, and an unknown value reads as lookup", () => {
		expect(getCustomerCreationRecoveryStage({ ctx: buildContext() })).toBe(
			"lookup",
		);
		const ctx = buildContext();
		ctx.state.customerCreationRecoveryStage = "stripe_invoiced";
		expect(getCustomerCreationRecoveryStage({ ctx })).toBe("lookup");
	});

	test("is kept on ctx.state, never in the log payload", () => {
		const ctx = buildContext();

		setCustomerCreationRecoveryStage({ ctx, stage: "autumn_committed" });

		expect(ctx.state).toEqual({
			customerCreationRecoveryStage: "autumn_committed",
		});
		expect(ctx.extraLogs).toEqual({});
		expect(getCustomerCreationRecoveryStage({ ctx })).toBe("autumn_committed");
	});
});
