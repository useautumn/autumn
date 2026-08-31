import { expect } from "bun:test";
import type { LicenseCustomize, UpdateCatalogPlanParams } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { expectLicenseLinkCorrect } from "./expectLicenseLinkCorrect.js";
import {
	type CatalogTestItem,
	type CatalogV2Client,
	dashboardItem,
	getFullPlan,
	messagesItem,
	wordsItem,
} from "./seedLicensePlans.js";

/** Child v1 keeps 100 Messages; v2 is 50 Messages + Words. Team v1→v1, v2→v2. */
export const seedDivergedChildAnchors = async ({
	autumn,
	childId,
	parentId,
}: {
	autumn: CatalogV2Client;
	childId: string;
	parentId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: childId, name: "Seat", items: [messagesItem(100)] }],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentId,
				name: "Team",
				licenses: [{ license_plan_id: childId, included: 2 }],
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: childId,
				versioning: "new_version",
				active: true,
				items: [messagesItem(50), wordsItem(10)],
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentId,
				versioning: "new_version",
				active: true,
				licenses: [
					{ license_plan_id: childId, included: 2, version_slug: "v2" },
				],
			},
		],
	});
};

export const atmnDirectPut = ({
	childId,
	parentId,
	childV1Items = [messagesItem(100), dashboardItem()],
	childV2Items = [messagesItem(50), wordsItem(10), dashboardItem()],
	includeChildSlugs = true,
	draft = false,
	parentV1Customize,
	parentV2Customize,
}: {
	childId: string;
	parentId: string;
	childV1Items?: CatalogTestItem[];
	childV2Items?: CatalogTestItem[];
	includeChildSlugs?: boolean;
	draft?: boolean;
	parentV1Customize?: LicenseCustomize;
	parentV2Customize?: LicenseCustomize;
}): UpdateCatalogPlanParams[] => {
	const migration = draft ? { draft: true as const } : undefined;
	return [
		{
			plan_id: childId,
			version_slug: "v1",
			items: childV1Items,
			...(migration ? { migration } : {}),
		},
		{
			plan_id: childId,
			version_slug: "v2",
			items: childV2Items,
			...(migration ? { migration } : {}),
		},
		{
			plan_id: parentId,
			version_slug: "v1",
			licenses: [
				{
					license_plan_id: childId,
					included: 2,
					...(includeChildSlugs ? { version_slug: "v1" } : {}),
					...(parentV1Customize ? { customize: parentV1Customize } : {}),
				},
			],
			...(migration ? { migration } : {}),
		},
		{
			plan_id: parentId,
			version_slug: "v2",
			licenses: [
				{
					license_plan_id: childId,
					included: 2,
					...(includeChildSlugs ? { version_slug: "v2" } : {}),
					...(parentV2Customize ? { customize: parentV2Customize } : {}),
				},
			],
			...(migration ? { migration } : {}),
		},
	];
};

type ExpectedAnchoredRow = {
	messagesAllowance: number;
	customized?: boolean;
	hasDashboard?: boolean;
	hasWords?: boolean;
	planLicenseId?: string;
};

export const expectAnchoredParentLink = async ({
	ctx,
	childId,
	parentId,
	parentVersion,
	childInternalId,
	childVersion,
	expected,
}: {
	ctx: AutumnContext;
	childId: string;
	parentId: string;
	parentVersion: 1 | 2;
	childInternalId: string;
	childVersion: 1 | 2;
	expected: ExpectedAnchoredRow;
}) =>
	expectLicenseLinkCorrect({
		ctx,
		parentPlanId: parentId,
		parentVersion,
		licensePlanId: childId,
		included: 2,
		customized: expected.customized ?? false,
		messagesAllowance: expected.messagesAllowance,
		entitlements: [
			...(expected.hasDashboard
				? [{ feature_id: TestFeature.Dashboard }]
				: []),
			...(expected.hasWords
				? [{ feature_id: TestFeature.Words, allowance: 10 }]
				: []),
		],
		omitFeatureIds: [
			...(expected.hasDashboard ? [] : [TestFeature.Dashboard]),
			...(expected.hasWords ? [] : [TestFeature.Words]),
		],
		licenseInternalProductId: childInternalId,
		licenseVersion: childVersion,
		planLicenseId: expected.planLicenseId,
	});

export const expectChildVersionItems = async ({
	ctx,
	childId,
	version,
	messagesAllowance,
	hasDashboard,
	hasWords,
}: {
	ctx: AutumnContext;
	childId: string;
	version: 1 | 2;
	messagesAllowance: number;
	hasDashboard: boolean;
	hasWords: boolean;
}) => {
	const plan = await getFullPlan({ ctx, planId: childId, version });
	expect(plan.entitlements).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: messagesAllowance,
			}),
			...(hasDashboard
				? [expect.objectContaining({ feature_id: TestFeature.Dashboard })]
				: []),
			...(hasWords
				? [
						expect.objectContaining({
							feature_id: TestFeature.Words,
							allowance: 10,
						}),
					]
				: []),
		]),
	);
	if (!hasDashboard) {
		expect(
			plan.entitlements.some(
				(entitlement) => entitlement.feature_id === TestFeature.Dashboard,
			),
		).toBe(false);
	}
	if (!hasWords) {
		expect(
			plan.entitlements.some(
				(entitlement) => entitlement.feature_id === TestFeature.Words,
			),
		).toBe(false);
	}
};

export const expectAnchoredDashboardCompose = async ({
	ctx,
	childId,
	parentId,
	childV1InternalId,
	childV2InternalId,
	teamV1LicenseId,
	teamV2LicenseId,
}: {
	ctx: AutumnContext;
	childId: string;
	parentId: string;
	childV1InternalId: string;
	childV2InternalId: string;
	teamV1LicenseId?: string;
	teamV2LicenseId?: string;
}) => {
	await expectChildVersionItems({
		ctx,
		childId,
		version: 1,
		messagesAllowance: 100,
		hasDashboard: true,
		hasWords: false,
	});
	await expectChildVersionItems({
		ctx,
		childId,
		version: 2,
		messagesAllowance: 50,
		hasDashboard: true,
		hasWords: true,
	});

	const teamV1 = await expectAnchoredParentLink({
		ctx,
		childId,
		parentId,
		parentVersion: 1,
		childInternalId: childV1InternalId,
		childVersion: 1,
		expected: {
			messagesAllowance: 100,
			hasDashboard: true,
			planLicenseId: teamV1LicenseId,
		},
	});
	const teamV2 = await expectAnchoredParentLink({
		ctx,
		childId,
		parentId,
		parentVersion: 2,
		childInternalId: childV2InternalId,
		childVersion: 2,
		expected: {
			messagesAllowance: 50,
			hasDashboard: true,
			hasWords: true,
			planLicenseId: teamV2LicenseId,
		},
	});
	return {
		teamV1LicenseId: teamV1.planLicense.id,
		teamV2LicenseId: teamV2.planLicense.id,
	};
};
