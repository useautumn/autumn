import { test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { logPlaybook, resetCatalogFeatures } from "../utils/catalogScenario.js";

const unusedId = "qa-feat-unused";
const archivedId = "qa-feat-unused-arch";

test(`${chalk.yellowBright("catalog-qa: unused features")}`, async () => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	await resetCatalogFeatures({ ctx, featureIds: [unusedId, archivedId] });

	const archivedFeature = {
		feature_id: archivedId,
		name: "QA Unused Archived Feature",
		type: FeatureType.Boolean,
	};
	await autumnV2_3.catalogV2.update({
		features: [
			{
				feature_id: unusedId,
				name: "QA Unused Feature",
				type: FeatureType.Metered,
				consumable: true,
			},
			archivedFeature,
		],
	});
	await autumnV2_3.catalogV2.update({
		features: [{ ...archivedFeature, archived: true }],
	});

	logPlaybook({
		title: "Unused features (no plans, no customers)",
		steps: [
			`Delete "QA Unused Feature" → hard delete, gone from the list.`,
			`Show archived → delete "QA Unused Archived Feature" → also gone, not left archived.`,
		],
	});
});
