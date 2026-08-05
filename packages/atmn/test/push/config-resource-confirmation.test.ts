import { expect, test } from "bun:test";
import type { CatalogPreviewUpdateResponse } from "@autumn/shared";
import { buildPromptQueueFromPreview } from "../../src/commands/push/headless.js";
import { catalogPreviewToPushResult } from "../../src/commands/push/push.js";
import { AppEnv } from "../../src/lib/env/index.js";

const preview = {
	feature_changes: [],
	plan_changes: [],
	reward_changes: [
		{ id: "launch", action: "deleted" },
		{ id: "launch-updated", action: "updated" },
		{ id: "launch-created", action: "created" },
	],
	referral_program_changes: [
		{ id: "refer", action: "deleted" },
		{ id: "refer-updated", action: "updated" },
		{ id: "refer-created", action: "created" },
	],
} as CatalogPreviewUpdateResponse;

/** Before: only deletions prompted; after: every config-resource change requires one grouped confirmation. */
test("reward and referral program changes require confirmation", () => {
	const prompts = buildPromptQueueFromPreview(
		preview,
		{ features: [], plans: [] },
		AppEnv.Sandbox,
		[],
	);

	expect(prompts).toHaveLength(1);
	expect(prompts[0]).toMatchObject({
		type: "config_resources_confirmation",
		options: [
			{ label: "Push changes", value: "confirm", isDefault: true },
			{ label: "Cancel push", value: "cancel", isDefault: false },
		],
		data: {
			changes: [
				{ id: "launch", action: "deleted", resourceType: "reward" },
				{ id: "launch-updated", action: "updated", resourceType: "reward" },
				{ id: "launch-created", action: "created", resourceType: "reward" },
				{
					id: "refer",
					action: "deleted",
					resourceType: "referral program",
				},
				{
					id: "refer-updated",
					action: "updated",
					resourceType: "referral program",
				},
				{
					id: "refer-created",
					action: "created",
					resourceType: "referral program",
				},
			],
		},
	});
});

test("reward and referral program changes appear in the push result", () => {
	const result = catalogPreviewToPushResult(preview) as any;

	expect(result.rewardsDeleted).toEqual(["launch"]);
	expect(result.rewardsUpdated).toEqual(["launch-updated"]);
	expect(result.referralProgramsDeleted).toEqual(["refer"]);
	expect(result.referralProgramsUpdated).toEqual(["refer-updated"]);
});
