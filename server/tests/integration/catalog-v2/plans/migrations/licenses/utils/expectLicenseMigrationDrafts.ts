import { expect } from "bun:test";
import type {
	UpdateCatalogPlanParams,
	UpdateCatalogResponse,
} from "@autumn/shared";
import {
	collectCustomerPlanIds,
	collectPlanFilterPlanIds,
	formatPlanFilter,
	planFiltersAreSame,
} from "@autumn/shared/api/products/utils/compare/planFiltersAreSame.js";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { parsePlanPreview } from "../../../preview/utils/expectPlanPreview.js";
import {
	deleteMigrations,
	expectUpdateMigrations,
} from "../../utils/expectMigrationDrafts.js";
import type { CatalogV2Client } from "../../../licenses/utils/seedLicensePlans.js";

export const messagesItemDelta = ({ included }: { included: number }) => ({
	remove_items: [
		{
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			interval_count: 1,
		},
	],
	add_items: [
		{
			feature_id: TestFeature.Messages,
			included,
			unlimited: false,
			reset: { interval: ResetInterval.Month },
		},
	],
});

export const dashboardAddItem = { feature_id: TestFeature.Dashboard };

export const dashboardAddCustomize = {
	add_items: [dashboardAddItem],
};

/** Follow a Seat overlay: keep this included amount, add Dashboard. */
export const licenseKeepMessagesAddDashboard = ({
	included,
}: {
	included: number;
}) => ({
	remove_items: [
		{
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			interval_count: 1,
		},
	],
	add_items: [
		{
			feature_id: TestFeature.Dashboard,
			included: 0,
			unlimited: false,
		},
		{
			feature_id: TestFeature.Messages,
			included,
			unlimited: false,
			reset: { interval: ResetInterval.Month },
		},
	],
});

/** Delete Messages and add Words — same replace across every child. */
export const messagesToWordsDelta = ({
	included = 100,
}: {
	included?: number;
} = {}) => ({
	remove_items: [
		{
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			interval_count: 1,
		},
	],
	add_items: [
		{
			feature_id: TestFeature.Words,
			included,
			unlimited: false,
			reset: { interval: ResetInterval.Month },
		},
	],
});

export const versionPinnedFilter = ({
	planId,
	version = 1,
}: {
	planId: string;
	version?: number;
}): PlanFilter => ({
	plan_id: planId,
	version,
	custom: false,
});

export const collapsedPlanFilter = ({
	planId,
}: {
	planId: string;
}): PlanFilter => ({
	plan_id: planId,
	custom: false,
});

/** CatalogV2 buckets multiple plans as $or of per-plan branches, sorted by plan_id. */
export const orPlanFilter = ({
	branches,
}: {
	branches: PlanFilter[];
}): PlanFilter => ({
	$or: [...branches].sort((left, right) =>
		String(left.plan_id).localeCompare(String(right.plan_id)),
	),
	custom: false,
});

export const orVersionPinnedFilter = ({
	branches,
}: {
	branches: { planId: string; version?: number }[];
}): PlanFilter =>
	orPlanFilter({
		branches: branches.map(({ planId, version = 1 }) => ({
			plan_id: planId,
			version,
		})),
	});

type LicenseCustomize = NonNullable<
	NonNullable<UpdatePlanOp["customize"]>["upsert_licenses"]
>[number]["customize"];

export const parentLicensesOp = ({
	planFilter,
	upserts,
}: {
	planFilter: PlanFilter;
	upserts: { childId: string; customize: LicenseCustomize }[];
}): UpdatePlanOp => ({
	type: "update_plan",
	plan_filter: planFilter,
	customize: {
		upsert_licenses: [...upserts]
			.sort((left, right) => left.childId.localeCompare(right.childId))
			.map(({ childId, customize }) => ({
				license_plan_id: childId,
				customize,
			})),
	},
});

export const parentLicenseOp = ({
	planFilter,
	childId,
	customize,
}: {
	planFilter: PlanFilter;
	childId: string;
	customize: LicenseCustomize;
}): UpdatePlanOp =>
	parentLicensesOp({
		planFilter,
		upserts: [{ childId, customize }],
	});

export const childItemOp = ({
	planFilter,
	customize,
}: {
	planFilter: PlanFilter;
	customize: NonNullable<UpdatePlanOp["customize"]>;
}): UpdatePlanOp => ({
	type: "update_plan",
	plan_filter: planFilter,
	customize,
});

type DraftOp = {
	type: string;
	plan_filter?: PlanFilter;
	customize?: UpdatePlanOp["customize"];
	version?: number;
};

type DraftLike = {
	filter?: MigrationFilter | null;
	operations?: { customer?: DraftOp[] } | null;
	no_billing_changes?: boolean | null;
};

export type ExpectedLicenseDraft = {
	filter: MigrationFilter;
	noBillingChanges?: boolean;
	planIds: string[];
	omitPlanIds?: string[];
	operations: UpdatePlanOp[];
};

const collectDraftPlanIds = ({
	filter,
	operations,
}: {
	filter?: MigrationFilter | null;
	operations: DraftOp[];
}): string[] => [
	...collectCustomerPlanIds({ plan: filter?.customer?.plan }),
	...operations.flatMap((operation) =>
		collectPlanFilterPlanIds({ planFilter: operation.plan_filter }),
	),
];

const asUpdatePlanOp = (operation: DraftOp) => {
	expect(operation.type).toBe("update_plan");
	return operation as UpdatePlanOp;
};

/** Exact filter; ops matched by plan_filter (order-independent). Customize via toMatchObject. */
export const expectLicenseMigrationDraftsCorrect = ({
	expected,
	migrations,
}: {
	expected: ExpectedLicenseDraft[];
	migrations: DraftLike[];
}) => {
	expect(migrations).toHaveLength(expected.length);

	const remaining = [...migrations];
	for (const expectedDraft of expected) {
		const index = remaining.findIndex((migration) => {
			const planIds = collectDraftPlanIds({
				filter: migration.filter,
				operations: migration.operations?.customer ?? [],
			});
			return expectedDraft.planIds.every((planId) => planIds.includes(planId));
		});
		expect(index).toBeGreaterThanOrEqual(0);

		const [migration] = remaining.splice(index, 1);
		const operations = migration.operations?.customer ?? [];

		expect(migration.filter).toEqual(expectedDraft.filter);
		if (expectedDraft.noBillingChanges !== undefined) {
			expect(migration.no_billing_changes).toBe(expectedDraft.noBillingChanges);
		}
		expect(operations).toHaveLength(expectedDraft.operations.length);

		const remainingOps = [...operations];
		for (const expectedOp of expectedDraft.operations) {
			const opIndex = remainingOps.findIndex((operation) => {
				if (operation.type !== "update_plan") return false;
				return planFiltersAreSame({
					left: operation.plan_filter,
					right: expectedOp.plan_filter,
				});
			});
			expect(
				opIndex,
				`missing update_plan for ${formatPlanFilter(expectedOp.plan_filter)}`,
			).toBeGreaterThanOrEqual(0);

			const operation = asUpdatePlanOp(remainingOps.splice(opIndex, 1)[0]!);
			expect(operation).not.toHaveProperty("version");

			const expectedLicenses = expectedOp.customize?.upsert_licenses;
			const expectedHasOwnCustomize =
				expectedOp.customize?.add_items != null ||
				expectedOp.customize?.remove_items != null ||
				expectedOp.customize?.price != null;

			if (expectedLicenses && !expectedHasOwnCustomize) {
				expect(operation.customize?.add_items).toBeUndefined();
				expect(operation.customize?.remove_items).toBeUndefined();
				expect(operation.customize?.price).toBeUndefined();
				const byLicensePlanId = (
					licenses: NonNullable<typeof expectedLicenses>,
				) =>
					[...licenses].sort((left, right) =>
						left.license_plan_id.localeCompare(right.license_plan_id),
					);
				expect(
					byLicensePlanId(operation.customize?.upsert_licenses ?? []),
				).toMatchObject(byLicensePlanId(expectedLicenses));
			} else {
				if (!expectedLicenses) {
					expect(operation.customize?.upsert_licenses).toBeUndefined();
				}
				expect(operation.customize).toMatchObject(expectedOp.customize ?? {});
			}
		}

		for (const omitPlanId of expectedDraft.omitPlanIds ?? []) {
			expect(
				collectDraftPlanIds({
					filter: migration.filter,
					operations,
				}),
			).not.toContain(omitPlanId);
		}
	}
};

export const expectUpdateHasNoMigrations = ({
	response,
}: {
	response: UpdateCatalogResponse;
}) => {
	expect(response.migrations ?? []).toHaveLength(0);
};

export const expectLicenseDraftCase = async ({
	autumn,
	ctx,
	plans,
	expected,
	responsePlans,
	preview = false,
}: {
	autumn: CatalogV2Client;
	ctx: AutumnContext;
	plans: UpdateCatalogPlanParams[];
	expected: ExpectedLicenseDraft[];
	responsePlans?: { plan_id: string; versions: number[] }[][];
	preview?: boolean;
}) => {
	if (preview) {
		const before = await migrationRepo.get({ ctx });
		const parsed = parsePlanPreview(
			await autumn.catalogV2.previewUpdate({ plans }),
		);
		expect(parsed.migrations).toHaveLength(expected.length);
		if (expected.length > 0) {
			expect(parsed.migrations[0]).not.toHaveProperty("id");
			expectLicenseMigrationDraftsCorrect({
				migrations: parsed.migrations,
				expected,
			});
		}
		expect(await migrationRepo.get({ ctx })).toHaveLength(before.length);
	}

	const response = await autumn.catalogV2.update({ plans });
	if (expected.length === 0) {
		expectUpdateHasNoMigrations({
			response: response as UpdateCatalogResponse,
		});
		return { response: response as UpdateCatalogResponse };
	}

	const typed = response as UpdateCatalogResponse;
	expectUpdateMigrations({
		response: typed,
		plans: responsePlans ?? [expected[0]!.planIds.map((plan_id) => ({
			plan_id,
			versions: [1],
		}))],
	});
	const migrationId = typed.migrations![0]!.id;
	expectLicenseMigrationDraftsCorrect({
		migrations: await migrationRepo.get({
			ctx,
			id: migrationId,
		}),
		expected,
	});
	await deleteMigrations({ ctx, ids: [migrationId] });
	return { response: typed, migrationId };
};
