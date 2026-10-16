import { describe, expect, test } from "bun:test";
import type {
	PreviewUpdateCatalogResponse,
	UpdateCatalogParamsInput,
} from "@autumn/shared";
import {
	buildImportPreviewRows,
	matchesImportPreviewFilter,
} from "../../../../src/views/products/catalog-transfer/utils/importPreviewRows";

const state = { has_customers: false, will_archive: false, reasons: [] };

const planPreview = ({
	plan_id,
	action,
	version_slug = "v1",
	plan_change = null,
}: {
	plan_id: string;
	action: string;
	version_slug?: string;
	plan_change?: unknown;
}) => ({
	plan_id,
	internal_id: null,
	version: 1,
	version_slug,
	active: true,
	state,
	action,
	versioning: null,
	plan_change,
});

const preview = {
	features: [
		{
			feature_id: "messages",
			internal_id: null,
			name: "Messages",
			action: "update",
			state,
			previous_attributes: { name: "Msgs" },
		},
		{
			feature_id: "sso",
			internal_id: null,
			action: "none",
			state,
			previous_attributes: null,
		},
	],
	plans: [
		planPreview({
			plan_id: "pro",
			action: "update",
			plan_change: {
				price_change: {
					previous: { amount: 39, interval: "month" },
					current: { amount: 49, interval: "month" },
				},
				item_changes: [{ action: "created", feature_id: "messages", item: {} }],
			},
		}),
		planPreview({ plan_id: "team", action: "none", version_slug: "v1" }),
		planPreview({ plan_id: "team", action: "create", version_slug: "v2" }),
		planPreview({ plan_id: "seat", action: "create" }),
	],
	rewards: [],
	referral_programs: [],
	migrations: [],
} as unknown as PreviewUpdateCatalogResponse;

const request = {
	plans: [
		{ plan_id: "pro", name: "Pro" },
		{ plan_id: "team", name: "Team", version_slug: "v1" },
		{
			plan_id: "team",
			name: "Team",
			version_slug: "v2",
			licenses: [{ license_plan_id: "seat" }],
		},
		{ plan_id: "seat", name: "Team seat", add_on: true },
	],
} as UpdateCatalogParamsInput;

describe("buildImportPreviewRows", () => {
	const rows = buildImportPreviewRows({ preview, request });

	test("lists plans before features", () => {
		expect(rows.map((row) => `${row.kind}:${row.id}`)).toEqual([
			"plans:pro",
			"plans:team",
			"plans:team",
			"plans:seat",
			"features:messages",
			"features:sso",
		]);
	});

	test("summarises each row and marks unchanged ones", () => {
		const [pro, teamV1, teamV2, seat, messages, sso] = rows;
		expect(pro?.summary).toBe("Price $39 → $49 · +1 item");
		expect(teamV1?.changed).toBe(false);
		expect(teamV2?.badges).toEqual(["v2"]);
		expect(seat?.badges).toEqual(["License", "Add-on"]);
		expect(messages?.summary).toBe("name changed");
		expect(sso?.changed).toBe(false);
	});

	test("filters by action and kind", () => {
		const created = rows.filter((row) =>
			matchesImportPreviewFilter({
				row,
				filter: { action: "create", kind: "plans" },
			}),
		);
		expect(created.map((row) => row.id)).toEqual(["team", "seat"]);
	});
});
