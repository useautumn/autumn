import { expect } from "bun:test";
import type {
	ApiPlanLicenseV1,
	CatalogConflictPreview,
	CatalogLicenseAction,
	CatalogPlanVersioningStrategy,
	CatalogSiblingVersionPreview,
	PreviewUpdateCatalogResponse,
} from "@autumn/shared";
import { PreviewUpdateCatalogResponseSchema } from "@autumn/shared";

type PlanPreviewRow = PreviewUpdateCatalogResponse["plans"][number];
type PlanPreviewChange = NonNullable<PlanPreviewRow["plan_change"]>;
type PlanPreviewVersioning = NonNullable<PlanPreviewRow["versioning"]>;

type ExpectedLicenseChange = Partial<
	Omit<
		NonNullable<PlanPreviewChange["license_changes"]>[number],
		"plan_change"
	>
> & { plan_change?: Record<string, unknown> | null };

type ExpectedSiblingVersion = {
	version: number;
	selected?: boolean;
	hasCustomers?: boolean;
	/** true = plan_change present; false/null = absent. */
	hasPlanChange?: boolean;
	licenseChanges?: ExpectedLicenseChange[] | null;
	/** Containment over conflicts; pass `null` to assert absent/empty. */
	conflicts?: CatalogConflictPreview[] | null;
};

type ExpectedLicenseParent = {
	planId: string;
	version?: number;
	licenseAction?: CatalogLicenseAction;
	name?: string;
	hasCustomers?: boolean;
	customize?: PlanPreviewChange["customize"] | null;
	licenseChanges?: ExpectedLicenseChange[] | null;
	/** Containment over the first license_change's nested item_changes. */
	nestedItemChanges?: Array<Record<string, unknown>>;
	/** Containment over conflicts; pass `null` to assert absent/empty. */
	conflicts?: CatalogConflictPreview[] | null;
};

type ExpectedPlanPreviewRow = {
	planId: string;
	/** Disambiguate when multiple direct entries share a plan_id. */
	currentVersion?: number;
	action?: PlanPreviewRow["action"];
	name?: string;
	hasCustomers?: boolean;
	willArchive?: boolean;
	/** Exact match; pass `null` to assert stubbed/absent versioning. */
	versioning?: PlanPreviewVersioning | null;
	/** Containment over versioning.options (order-insensitive). */
	versioningOptions?: CatalogPlanVersioningStrategy[];
	/** Exact match; pass `null` to assert plan_change is absent (undefined or null). */
	planChange?: PlanPreviewChange | null;
	/** Containment over plan_change.previous_attributes keys/values. */
	previousAttributes?: Record<string, unknown> | null;
	/** Containment over customize lanes; pass `null` to assert absent. */
	customize?: PlanPreviewChange["customize"] | null;
	priceChange?: PlanPreviewChange["price_change"] | null;
	freeTrialChange?: PlanPreviewChange["free_trial_change"] | null;
	itemChanges?: PlanPreviewChange["item_changes"];
	/** Containment over license_changes; pass `null` to assert absent. */
	licenseChanges?: ExpectedLicenseChange[] | null;
	/** Containment over sibling_versions; pass `null` to assert the lane is omitted. */
	siblingVersions?: ExpectedSiblingVersion[] | null;
	/** Containment over licenses; pass `null` to assert the lane is omitted. */
	licenses?: ApiPlanLicenseV1[] | null;
	/** Containment over license_parents; pass `null` to assert the lane is omitted. */
	licenseParents?: ExpectedLicenseParent[] | null;
};

const expectAbsent = (value: unknown) => {
	expect(value == null).toBe(true);
};

const expectPresent = (value: unknown) => {
	expect(value != null).toBe(true);
};

const expectConflictsMatch = ({
	actual,
	expected,
}: {
	actual: CatalogConflictPreview[] | undefined;
	expected: CatalogConflictPreview[] | null;
}) => {
	if (expected === null) {
		expect(actual == null || actual.length === 0).toBe(true);
		return;
	}
	expect(actual).toHaveLength(expected.length);
	expect(actual).toMatchObject(expected);
};


const expectLicenseChangesMatch = ({
	actual,
	expected,
}: {
	actual: PlanPreviewChange["license_changes"];
	expected: ExpectedLicenseChange[] | null;
}) => {
	if (expected === null) {
		expect(actual).toBeUndefined();
		return;
	}
	expect(actual).toMatchObject(
		expected.map(({ plan_change, ...rest }) =>
			plan_change == null ? rest : { ...rest, plan_change },
		),
	);
	for (const [index, expectedChange] of expected.entries()) {
		if (expectedChange.plan_change === null) {
			expectAbsent(actual?.[index]?.plan_change);
		} else if (expectedChange.plan_change !== undefined) {
			expect(actual?.[index]?.plan_change).not.toHaveProperty(
				"license_changes",
			);
		}
	}
};

/** Parse + schema-validate the preview response; throws on shape drift. */
export const parsePlanPreview = (raw: unknown): PreviewUpdateCatalogResponse =>
	PreviewUpdateCatalogResponseSchema.parse(raw);

export const findPlanPreviewRow = ({
	preview,
	planId,
	currentVersion,
}: {
	preview: PreviewUpdateCatalogResponse;
	planId: string;
	currentVersion?: number;
}): PlanPreviewRow => {
	const row = preview.plans.find(
		(candidate) =>
			candidate.plan_id === planId &&
			(currentVersion === undefined ||
				candidate.versioning?.current_version === currentVersion),
	);
	const label =
		currentVersion === undefined ? planId : `${planId} v${currentVersion}`;
	expect(row, `missing preview row for plan ${label}`).toBeDefined();
	if (!row) throw new Error(`missing preview row for plan ${label}`);
	return row;
};

/** Containment asserts for one plan preview row — only fields passed are checked. */
export const expectPlanPreviewRowCorrect = ({
	preview,
	expected,
}: {
	preview: PreviewUpdateCatalogResponse;
	expected: ExpectedPlanPreviewRow;
}) => {
	const row = findPlanPreviewRow({
		preview,
		planId: expected.planId,
		currentVersion: expected.currentVersion,
	});

	if (expected.action !== undefined) {
		expect(row.action).toBe(expected.action);
	}
	if (expected.name !== undefined) {
		expect(row.name).toBe(expected.name);
	}
	if (expected.hasCustomers !== undefined) {
		expect(row.state.has_customers).toBe(expected.hasCustomers);
	}
	if (expected.willArchive !== undefined) {
		expect(row.state.will_archive).toBe(expected.willArchive);
	}
	if (expected.versioning !== undefined) {
		expect(row.versioning).toEqual(expected.versioning);
	}
	if (expected.versioningOptions !== undefined) {
		expectPresent(row.versioning);
		expect([...((row.versioning?.options ?? []) as string[])].sort()).toEqual(
			[...expected.versioningOptions].sort(),
		);
	}
	if (expected.planChange !== undefined) {
		if (expected.planChange === null) {
			expectAbsent(row.plan_change);
		} else {
			expect(row.plan_change).toEqual(expected.planChange);
		}
	}
	if (expected.previousAttributes !== undefined) {
		if (expected.previousAttributes === null) {
			expectAbsent(row.plan_change?.previous_attributes);
		} else {
			expectPresent(row.plan_change);
			expect(row.plan_change?.previous_attributes).toMatchObject(
				expected.previousAttributes,
			);
			for (const key of Object.keys(
				row.plan_change?.previous_attributes ?? {},
			)) {
				expect(
					Object.keys(expected.previousAttributes),
					`unexpected previous_attributes key ${key}`,
				).toContain(key);
			}
		}
	}
	if (expected.customize !== undefined) {
		if (expected.customize === null) {
			expectAbsent(row.plan_change?.customize);
		} else {
			expect(row.plan_change?.customize).toMatchObject(expected.customize);
		}
	}
	if (expected.priceChange !== undefined) {
		if (expected.priceChange === null) {
			expectAbsent(row.plan_change?.price_change);
		} else {
			expect(row.plan_change?.price_change).toMatchObject(expected.priceChange);
		}
	}
	if (expected.freeTrialChange !== undefined) {
		if (expected.freeTrialChange === null) {
			expectAbsent(row.plan_change?.free_trial_change);
		} else {
			expect(row.plan_change?.free_trial_change).toMatchObject(
				expected.freeTrialChange,
			);
		}
	}
	if (expected.itemChanges !== undefined) {
		expect(row.plan_change?.item_changes ?? []).toEqual(expected.itemChanges);
	}
	if (expected.licenseChanges !== undefined) {
		expectLicenseChangesMatch({
			actual: row.plan_change?.license_changes,
			expected: expected.licenseChanges,
		});
	}
	if (expected.siblingVersions !== undefined) {
		if (expected.siblingVersions === null) {
			expect(row.sibling_versions).toBeUndefined();
		} else {
			expect(row.sibling_versions).toHaveLength(
				expected.siblingVersions.length,
			);
			for (const expectedSibling of expected.siblingVersions) {
				const sibling = row.sibling_versions?.find(
					(candidate: CatalogSiblingVersionPreview) =>
						candidate.version === expectedSibling.version,
				);
				expect(
					sibling,
					`missing sibling_versions entry for v${expectedSibling.version}`,
				).toBeDefined();
				if (expectedSibling.selected !== undefined) {
					expect(
						(sibling as { selected?: boolean } | undefined)?.selected,
					).toBe(expectedSibling.selected);
				}
				if (expectedSibling.hasCustomers !== undefined) {
					expect(sibling?.state.has_customers).toBe(
						expectedSibling.hasCustomers,
					);
				}
				if (expectedSibling.hasPlanChange === true) {
					expectPresent(sibling?.plan_change);
				} else if (expectedSibling.hasPlanChange === false) {
					expectAbsent(sibling?.plan_change);
				}
				if (expectedSibling.licenseChanges !== undefined) {
					if (expectedSibling.licenseChanges === null) {
						expect(sibling?.plan_change?.license_changes).toBeUndefined();
					} else {
						expect(sibling?.plan_change?.license_changes).toMatchObject(
							expectedSibling.licenseChanges,
						);
					}
				}
				if (expectedSibling.conflicts !== undefined) {
					expectConflictsMatch({
						actual: sibling?.conflicts,
						expected: expectedSibling.conflicts,
					});
				}
			}
		}
	}
	if (expected.licenses !== undefined) {
		if (expected.licenses === null) {
			expect(row.licenses).toBeUndefined();
		} else {
			expect(row.licenses).toEqual(expected.licenses);
		}
	}
	if (expected.licenseParents !== undefined) {
		if (expected.licenseParents === null) {
			expect(row.license_parents).toBeUndefined();
		} else {
			expect(row.license_parents).toHaveLength(expected.licenseParents.length);
			for (const expectedParent of expected.licenseParents) {
				const parent = row.license_parents?.find(
					(candidate) =>
						candidate.plan_id === expectedParent.planId &&
						(expectedParent.version === undefined ||
							candidate.version === expectedParent.version),
				);
				expect(
					parent,
					`missing license_parents entry for ${expectedParent.planId}`,
				).toBeDefined();
				if (expectedParent.licenseAction !== undefined) {
					expect(parent?.license_action).toBe(expectedParent.licenseAction);
				}
				if (expectedParent.name !== undefined) {
					expect(parent?.name).toBe(expectedParent.name);
				}
				if (expectedParent.hasCustomers !== undefined) {
					expect(parent?.state.has_customers).toBe(
						expectedParent.hasCustomers,
					);
				}
				if (expectedParent.customize !== undefined) {
					if (expectedParent.customize === null) {
						expectAbsent(parent?.plan_change?.customize);
					} else {
						expect(parent?.plan_change?.customize).toMatchObject(
							expectedParent.customize,
						);
					}
				}
				if (expectedParent.licenseChanges !== undefined) {
					expectLicenseChangesMatch({
						actual: parent?.plan_change?.license_changes,
						expected: expectedParent.licenseChanges,
					});
				}
				if (expectedParent.nestedItemChanges !== undefined) {
					const actualItems =
						parent?.plan_change?.license_changes?.[0]?.plan_change
							?.item_changes ?? [];
					for (const expectedItem of expectedParent.nestedItemChanges) {
						expect(actualItems).toContainEqual(
							expect.objectContaining(expectedItem),
						);
					}
				}
				if (expectedParent.conflicts !== undefined) {
					expectConflictsMatch({
						actual: parent?.conflicts,
						expected: expectedParent.conflicts,
					});
				}
			}
		}
	}
};

export const expectPlanPreviewRowsCorrect = ({
	preview,
	expected,
}: {
	preview: PreviewUpdateCatalogResponse;
	expected: ExpectedPlanPreviewRow[];
}) => {
	for (const row of expected) {
		expectPlanPreviewRowCorrect({ preview, expected: row });
	}
};
