/**
 * organization.preview_update is the whole of what the CLI knows about org
 * settings: a stated flag that differs is an update; an unstated one sitting
 * off its default is unmanaged, and the default is the spec's, not the row's —
 * a row written with every default spelled out must still read as default.
 */

import { expect, test } from "bun:test";
import { OrgConfigSchema } from "@autumn/shared";
import { computeOrgSettingChanges } from "@/internal/orgs/actions/updateOrganization/computeOrgSettingChanges";

const config = (overrides: Record<string, unknown> = {}) =>
	OrgConfigSchema.parse(overrides);

test("a stated flag that differs is an update; one that matches is nothing", () => {
	const changes = computeOrgSettingChanges({
		config: config({ multi_currency: true }),
		stated: { multi_currency: false, cancel_on_past_due: false },
	});
	expect(changes).toEqual([
		{ key: "multi_currency", action: "update", previous: true, current: false },
	]);
});

test("an unstated flag off its default is unmanaged, with no current value", () => {
	const changes = computeOrgSettingChanges({
		config: config({ invoice_memos: true }),
		stated: {},
	});
	expect(changes).toEqual([
		{
			key: "invoice_memos",
			action: "unmanaged",
			previous: true,
			current: null,
		},
	]);
});

test("a row with every default spelled out reads as all-default", () => {
	// The spread bug: the dashboard once wrote the whole parsed config back.
	const changes = computeOrgSettingChanges({ config: config(), stated: {} });
	expect(changes).toEqual([]);
});

test("a flag outside the settable set never appears", () => {
	const changes = computeOrgSettingChanges({
		config: config({ cache_customer: true, sync_status: false }),
		stated: {},
	});
	expect(changes).toEqual([]);
});

test("changes come out in the settable set's order, updates and unmanaged mixed", () => {
	const changes = computeOrgSettingChanges({
		config: config({ cancel_on_past_due: true, automatic_tax: true }),
		stated: { automatic_tax: false, multi_currency: true },
	});
	expect(changes.map((change) => `${change.key}:${change.action}`)).toEqual([
		"cancel_on_past_due:unmanaged",
		"automatic_tax:update",
		"multi_currency:update",
	]);
});

test("the overdue flag is the stored one: the legacy twin does not speak for it", () => {
	// Entitlement checks read block_overdue_entitlements alone, and so does the
	// dashboard toggle; a legacy include_past_due: false must not be read as it.
	const legacy = { ...config(), include_past_due: false };
	expect(computeOrgSettingChanges({ config: legacy, stated: {} })).toEqual([]);
	expect(
		computeOrgSettingChanges({
			config: legacy,
			stated: { block_overdue_entitlements: true },
		}),
	).toEqual([
		{
			key: "block_overdue_entitlements",
			action: "update",
			previous: false,
			current: true,
		},
	]);
});
