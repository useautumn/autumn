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
