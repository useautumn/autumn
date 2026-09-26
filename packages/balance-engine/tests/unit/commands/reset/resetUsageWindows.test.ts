import { describe, expect, test } from "bun:test";
import {
	EntInterval,
	getUsageWindowBounds,
	ResetInterval,
} from "@autumn/shared";
import {
	computeReset,
	createSubjectState,
	type ResetCommand,
	type WorkerCustomer,
	type WorkerUsageWindow,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	identity,
	occurredAt,
	org,
} from "../../engineFixtures.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const today = getUsageWindowBounds({
	interval: EntInterval.Day,
	now: occurredAt,
});

const customerWithDailyCap: WorkerCustomer = {
	internal_id: identity.customerId,
	id: identity.customerId,
	config: null,
	spend_limits: null,
	overage_allowed: null,
	usage_limits: [
		{
			feature_id: "messages",
			enabled: true,
			limit: 5,
			interval: ResetInterval.Day,
		},
	],
};

const counter = (
	overrides: Partial<WorkerUsageWindow> = {},
): WorkerUsageWindow => ({
	id: "uw_1",
	internal_customer_id: identity.customerId,
	internal_entity_id: null,
	feature_id: "messages",
	internal_feature_id: createCustomerEntitlement().internal_feature_id,
	filter_key: null,
	anchor_customer_entitlement_id: "messages_monthly",
	window_start_at: today.windowStartAt,
	window_end_at: today.windowEndAt,
	usage: 3,
	updated_at: occurredAt - 1,
	...overrides,
});

const resetCommand: ResetCommand = {
	schemaVersion: 1,
	type: "reset",
	commandId: "cmd_reset_1",
	requestId: "req_reset_1",
	identity,
	occurredAt,
	org,
};

const resetWith = ({
	usageWindows,
	customer = customerWithDailyCap,
}: {
	usageWindows: WorkerUsageWindow[];
	customer?: WorkerCustomer;
}) =>
	computeReset({
		fullSubject: createSubjectFor({
			state: createSubjectState({
				identity,
				customer,
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [createCustomerEntitlement()],
				usageWindows,
			}),
		}),
		command: resetCommand,
	});

describe("computeReset rolls usage windows", () => {
	test("a counter inside its current window writes nothing", () => {
		expect(resetWith({ usageWindows: [counter()] })).toBeNull();
	});

	test("an expired counter moves to today's window and its count zeroes", () => {
		const yesterday = counter({
			window_start_at: today.windowStartAt - DAY_MS,
			window_end_at: today.windowStartAt,
		});
		const mutation = resetWith({ usageWindows: [yesterday] });
		expect(mutation?.changes).toEqual([
			{
				table: "usageWindows",
				op: "update",
				id: "uw_1",
				before: {
					anchor_customer_entitlement_id: "messages_monthly",
					window_start_at: today.windowStartAt - DAY_MS,
					window_end_at: today.windowStartAt,
					usage: 3,
					updated_at: occurredAt - 1,
				},
				after: {
					anchor_customer_entitlement_id: "messages_monthly",
					window_start_at: today.windowStartAt,
					window_end_at: today.windowEndAt,
					usage: 0,
					updated_at: occurredAt,
				},
			},
		]);
		// Window rolls report no refilled rows, so no balances.reset follows.
		expect(mutation?.result).toEqual({ type: "reset", rows: [] });
	});

	test("an anchor-only move re-points the counter and keeps its count", () => {
		const mutation = resetWith({
			usageWindows: [counter({ anchor_customer_entitlement_id: "ce_gone" })],
		});
		expect(mutation?.changes).toEqual([
			{
				table: "usageWindows",
				op: "update",
				id: "uw_1",
				before: {
					anchor_customer_entitlement_id: "ce_gone",
					window_start_at: today.windowStartAt,
					window_end_at: today.windowEndAt,
					updated_at: occurredAt - 1,
				},
				after: {
					anchor_customer_entitlement_id: "messages_monthly",
					window_start_at: today.windowStartAt,
					window_end_at: today.windowEndAt,
					updated_at: occurredAt,
				},
			},
		]);
	});

	test("an expired counter with no limit left zeroes once, then writes nothing", () => {
		const noCap = { ...customerWithDailyCap, usage_limits: null };
		const expired = {
			window_start_at: today.windowStartAt - DAY_MS,
			window_end_at: today.windowStartAt,
		};
		expect(
			resetWith({ usageWindows: [counter(expired)], customer: noCap })?.changes,
		).toHaveLength(1);
		expect(
			resetWith({
				usageWindows: [counter({ ...expired, usage: 0 })],
				customer: noCap,
			}),
		).toBeNull();
	});
});
