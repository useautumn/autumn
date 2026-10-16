/**
 * S3 contract: `ACTIONS` lists every action a rule can name, with ids that are
 * the RPC route names they gate, its area, labels, required scope and filter shape.
 *
 * Red (before):  the old ids (`billing.update_subscription`, `catalog.*`) and `when` key.
 * Green (after): the catalog matches the PRD §3/§6 tables below.
 */

import { describe, expect, test } from "bun:test";
import {
	ACTION_ALIASES,
	ACTIONS,
	APPROVAL_AREAS,
	APPROVAL_FILTER_FIELD_LABELS,
	APPROVAL_FILTER_SHAPES,
	type ApprovalAction,
	type ApprovalFilterKey,
	MODERN_SCOPES,
} from "@autumn/shared";

/** PRD §3/§6: area → action → filter shape (null = who-only). */
const BOARD: Record<string, Partial<Record<ApprovalAction, string | null>>> = {
	billing: {
		"billing.attach": "billing_change",
		"billing.update": "billing_change",
		"billing.set_plans": "billing_change",
		"billing.create_schedule": "billing_change",
		"billing.cancel": "billing_cancel",
		"billing.uncancel": "billing_uncancel",
	},
	invoices: {
		"invoices.create": "invoice",
		"invoices.finalize": "invoice",
		"invoices.pay": "invoice",
		"invoices.void": "invoice",
		"invoices.update": "invoice",
		"invoices.reissue": "invoice",
		"invoices.issue_credit_note": "invoice",
	},
	balances: {
		"balances.create": "balance_create",
		"balances.update": "balance_update",
	},
	rewards: { "rewards.create": null, "rewards.redeem": "reward_redeem" },
	customers: {
		"customers.get_or_create": null,
		"customers.update": "customer_change",
		"customers.delete": "customer_change",
	},
	plans: {
		"plans.create": "plan",
		"plans.update": "plan",
		"plans.delete": "plan",
	},
	features: {
		"features.create": "feature",
		"features.update": "feature",
		"features.delete": "feature",
	},
	api_keys: { "api_keys.create": null },
	migrations: { "migrations.create": null, "migrations.run": null },
	members: { "members.invite": null, "members.change_role": null },
};

const actionIds = Object.keys(ACTIONS) as ApprovalAction[];
const BARE_VERB_AREAS = [
	"invoices",
	"customers",
	"plans",
	"features",
	"api_keys",
	"migrations",
	"members",
];

describe("ACTIONS catalog", () => {
	test("matches the PRD board, area by area", () => {
		const catalog: Record<string, Record<string, string | null>> = {};
		for (const id of actionIds) {
			const { area, filter } = ACTIONS[id];
			catalog[area] = { ...catalog[area], [id]: filter };
		}
		expect(catalog).toEqual(BOARD);
	});

	test("each id is named after its area", () => {
		for (const id of actionIds)
			expect(id.startsWith(`${ACTIONS[id].area}.`)).toBe(true);
	});

	test.each(actionIds)("%s requires a real coarse write scope", (id) => {
		const { scope } = ACTIONS[id];
		expect(MODERN_SCOPES).toContain(scope);
		expect(scope.endsWith(":write")).toBe(true);
	});

	test("scopes follow the area", () => {
		const scopesByArea: Record<string, Set<string>> = {};
		for (const id of actionIds) {
			const { area, scope } = ACTIONS[id];
			scopesByArea[area] = (scopesByArea[area] ?? new Set()).add(scope);
		}
		expect(scopesByArea.billing).toEqual(new Set(["billing:write"]));
		expect(scopesByArea.invoices).toEqual(new Set(["billing:write"]));
		expect(scopesByArea.plans).toEqual(new Set(["plans:write"]));
		expect(scopesByArea.features).toEqual(new Set(["features:write"]));
	});

	test("area labels are unique and cover every area", () => {
		const labels = Object.values(APPROVAL_AREAS);
		expect(new Set(labels).size).toBe(labels.length);
		expect(Object.keys(APPROVAL_AREAS).sort()).toEqual(
			Object.keys(BOARD).sort(),
		);
	});

	test("bare-verb areas carry a sentence label", () => {
		for (const id of actionIds) {
			const action: { area: string; sentence_label?: string } = ACTIONS[id];
			if (!BARE_VERB_AREAS.includes(action.area)) continue;
			expect(action.sentence_label).toBeDefined();
		}
		expect(ACTIONS["plans.update"]).toMatchObject({
			sentence_label: "Update plans",
		});
	});

	test("ACTION_ALIASES point routes checked as another action at real actions", () => {
		expect(ACTION_ALIASES).toEqual({
			"billing.multi_attach": "billing.attach",
			"billing.multi_update": "billing.update",
			"migrations.lazy_run": "migrations.run",
		});
		for (const action of Object.values(ACTION_ALIASES))
			expect(actionIds).toContain(action);
	});
});

describe("APPROVAL_FILTER_FIELD_LABELS", () => {
	test.each(Object.keys(APPROVAL_FILTER_SHAPES) as ApprovalFilterKey[])(
		"%s labels every top-level field",
		(filterKey) => {
			const labels: Record<string, string> =
				APPROVAL_FILTER_FIELD_LABELS[filterKey];
			const unlabelled = Object.keys(APPROVAL_FILTER_SHAPES[filterKey]).filter(
				(field) => !labels[field],
			);
			expect(unlabelled).toEqual([]);
		},
	);

	test("board labels", () => {
		expect(APPROVAL_FILTER_FIELD_LABELS.billing_change).toMatchObject({
			paid: "Charges customer",
			checkout: "Sends checkout link",
			total: "Due now",
			entity: "Entity",
			"entity.feature_id": "Entity type",
			billing_cycle_anchor: "Billing cycle",
			"incoming.free_trial": "Free trial",
			"incoming.free_trial.duration": "Free trial length",
			"customer.has_paid": "Customer has paid before",
		});
		expect(APPROVAL_FILTER_FIELD_LABELS.balance_update.included_grant).toBe(
			"Included",
		);
		expect(APPROVAL_FILTER_FIELD_LABELS.invoice.refund).toBe(
			"Refund or credit amount",
		);
	});
});
