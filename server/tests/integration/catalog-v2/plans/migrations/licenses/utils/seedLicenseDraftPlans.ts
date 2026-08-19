import type { CatalogV2Client } from "../../../licenses/utils/seedLicensePlans.js";
import { messagesItem } from "../../../licenses/utils/seedLicensePlans.js";

/** Child v1..n first, then the parent link — so the license points at latest. */
export const seedChildVersionsThenParent = async ({
	autumn,
	childId,
	parentId,
	childVersions = [1, 2],
}: {
	autumn: CatalogV2Client;
	childId: string;
	parentId: string;
	childVersions?: number[];
}) => {
	for (const version of childVersions) {
		await autumn.catalogV2.update({
			plans: [
				{
					plan_id: childId,
					...(version > 1 ? { version } : {}),
					name: `Seat v${version}`,
					items: [messagesItem(10)],
				},
			],
		});
	}
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentId,
				name: "Team",
				licenses: [{ license_plan_id: childId, included: 2 }],
			},
		],
	});
};
