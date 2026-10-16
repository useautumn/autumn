/**
 * S3 contract: `ACTIONS` lists every action on the When fields board, each
 * mapped to its area, a label, a real coarse scope and its `when` fields.
 *
 * Red (before):  `ACTIONS` doesn't exist.
 * Green (after): the catalog matches the board below.
 */

import { describe, expect, test } from "bun:test";
import {
	ACTIONS,
	APPROVAL_AREAS,
	type ApprovalAction,
	MODERN_SCOPES,
	WHEN_FIELD_LABELS,
	WHEN_SHAPES,
} from "@autumn/shared";

/** The When fields board: area → action → which `when` fields it gets (null = who-only). */
const BOARD: Record<string, Partial<Record<ApprovalAction, string | null>>> = {
	billing: {
		"billing.attach": "billing_change",
		"billing.update_subscription": "billing_change",
		"billing.set_plans": "billing_change",
		"billing.schedule": "billing_change",
		"billing.cancel": "billing_cancel",
		"billing.uncancel": "billing_cancel",
	},
	invoices: {
		"invoices.create": "invoice",
		"invoices.finalize": "invoice",
		"invoices.pay": "invoice",
		"invoices.void": "invoice",
		"invoices.update": "invoice",
		"invoices.reissue": "invoice",
		"invoices.credit_note": "invoice",
	},
	balances: {
		"balances.create": "balance_create",
		"balances.update": "balance_update",
	},
	rewards: {
		"rewards.create": null,
		"rewards.apply": "reward_apply",
	},
	customers: {
		"customers.create": null,
		"customers.update": "customer",
		"customers.delete": "customer",
	},
	catalog: {
		"catalog.edit_plans": "catalog_plan",
		"catalog.edit_features": "catalog_feature",
	},
	api_keys: { "api_keys.create": null },
	migrations: { "migrations.create": null, "migrations.run": null },
	members: { "members.invite": null, "members.change_role": null },
};

const actionIds = Object.keys(ACTIONS) as ApprovalAction[];

describe("ACTIONS catalog", () => {
	test("matches the When fields board, area by area", () => {
		const catalog: Record<string, Record<string, string | null>> = {};
		for (const id of actionIds) {
			const { area, when } = ACTIONS[id];
			catalog[area] = { ...catalog[area], [id]: when };
		}
		expect(catalog).toEqual(BOARD);
	});

	test.each(actionIds)("%s maps to a real coarse write scope", (id) => {
		const { scope } = ACTIONS[id];
		expect(MODERN_SCOPES).toContain(scope);
		expect(scope.endsWith(":write")).toBe(true);
	});

	test("billing and invoice actions need billing:write", () => {
		const billingScopes = actionIds
			.filter((id) => ["billing", "invoices"].includes(ACTIONS[id].area))
			.map((id) => ACTIONS[id].scope);
		expect(new Set(billingScopes)).toEqual(new Set(["billing:write"]));
	});

	test("every action has a label and is named after its area", () => {
		for (const id of actionIds) {
			expect(ACTIONS[id].label.length).toBeGreaterThan(0);
			expect(id.startsWith(`${ACTIONS[id].area}.`)).toBe(true);
		}
	});

	test("area labels are unique and cover every area", () => {
		const labels = Object.values(APPROVAL_AREAS);
		expect(new Set(labels).size).toBe(labels.length);
		expect(Object.keys(APPROVAL_AREAS).sort()).toEqual(
			Object.keys(BOARD).sort(),
		);
	});

	test("there is no checkout.create_link action (checkout is a billing condition)", () => {
		expect(actionIds).not.toContain("checkout.create_link");
	});

	test("bare-verb areas carry a sentence label", () => {
		const bareVerbAreas = [
			"invoices",
			"customers",
			"api_keys",
			"migrations",
			"members",
		];
		for (const id of actionIds) {
			const action: { area: string; label: string; sentence_label?: string } =
				ACTIONS[id];
			if (!bareVerbAreas.includes(action.area)) continue;
			expect(action.sentence_label).toBeDefined();
		}
		expect(ACTIONS["invoices.create"]).toMatchObject({
			sentence_label: "Create invoices",
		});
	});
});

describe("WHEN_FIELD_LABELS", () => {
	test.each(Object.keys(WHEN_SHAPES) as (keyof typeof WHEN_SHAPES)[])(
		"%s labels every top-level field",
		(whenKey) => {
			const labels: Record<string, string> = WHEN_FIELD_LABELS[whenKey];
			const unlabelled = Object.keys(WHEN_SHAPES[whenKey]).filter(
				(field) => !labels[field],
			);
			expect(unlabelled).toEqual([]);
		},
	);

	test("board labels", () => {
		expect(WHEN_FIELD_LABELS.billing_change).toMatchObject({
			paid: "Charges customer",
			checkout: "Sends checkout link",
			total: "Due now",
			"incoming.free_trial": "Free trial",
		});
		expect(WHEN_FIELD_LABELS.balance_update.included_grant).toBe("Included");
		expect(WHEN_FIELD_LABELS.invoice.refund).toBe("Refund or credit amount");
	});
});
