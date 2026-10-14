import { TestFeature } from "@tests/setup/v2Features.js";
import {
	messagesItem,
	messagesOverride,
	wordsItem,
} from "../../licenses/utils/seedLicensePlans.js";

export type CatalogV2Client = {
	catalogV2: {
		update: (params: { plans: unknown[] }) => Promise<unknown>;
	};
};

export const seedBaseWithVariant = async ({
	autumn,
	baseId,
	variantId,
	baseMessages = 100,
	variantMessages = 200,
}: {
	autumn: CatalogV2Client;
	baseId: string;
	variantId: string;
	baseMessages?: number;
	variantMessages?: number;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				name: "Team",
				items: [messagesItem(baseMessages)],
				variants: [
					{
						variant_plan_id: variantId,
						name: "Team EU",
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [messagesItem(variantMessages)],
						},
					},
				],
			},
		],
	});
};

export const seedBaseWithTwoVariants = async ({
	autumn,
	baseId,
	variantIds,
	baseMessages = 100,
	variantMessages = 200,
}: {
	autumn: CatalogV2Client;
	baseId: string;
	variantIds: [string, string];
	baseMessages?: number;
	variantMessages?: number;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				name: "Team",
				items: [messagesItem(baseMessages)],
				variants: variantIds.map((variantId, index) => ({
					variant_plan_id: variantId,
					name: index === 0 ? "Team EU" : "Team UK",
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [messagesItem(variantMessages)],
					},
				})),
			},
		],
	});
};

export const seedDivergedVariantBase = async ({
	autumn,
	baseId,
}: {
	autumn: CatalogV2Client;
	baseId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				versioning: "new_version",
				active: true,
				items: [messagesItem(50), wordsItem(10)],
			},
		],
	});
};

export const seedVariantNewVersion = async ({
	autumn,
	variantId,
}: {
	autumn: CatalogV2Client;
	variantId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: variantId, versioning: "new_version", active: true }],
	});
};

export const seedBaseVariantWithChildLicense = async ({
	autumn,
	baseId,
	variantId,
	childId,
	baseMessages = 100,
	variantMessages = 200,
	customizeLicenses = true,
}: {
	autumn: CatalogV2Client;
	baseId: string;
	variantId: string;
	childId: string;
	baseMessages?: number;
	variantMessages?: number;
	customizeLicenses?: boolean;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: childId,
				name: "Seat",
				items: [messagesItem(10)],
			},
			{
				plan_id: baseId,
				name: "Team",
				items: [messagesItem(baseMessages)],
				licenses: [
					{
						license_plan_id: childId,
						included: 2,
						...(customizeLicenses
							? { customize: messagesOverride(baseMessages) }
							: {}),
					},
				],
				variants: [
					{
						variant_plan_id: variantId,
						name: "Team EU",
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [messagesItem(variantMessages)],
						},
					},
				],
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: variantId,
				licenses: [
					{
						license_plan_id: childId,
						included: 2,
						...(customizeLicenses
							? { customize: messagesOverride(variantMessages) }
							: {}),
					},
				],
			},
		],
	});
};
