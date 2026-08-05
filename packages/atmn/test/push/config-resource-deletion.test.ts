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
	],
	referral_program_changes: [
		{ id: "refer", action: "deleted" },
		{ id: "refer-updated", action: "updated" },
	],
} as CatalogPreviewUpdateResponse;

test("reward and referral program deletions require confirmation", () => {
	const prompts = buildPromptQueueFromPreview(
		preview,
		{ features: [], plans: [] },
		AppEnv.Sandbox,
		[],
	);

	expect(prompts.map(({ entityId }) => entityId)).toEqual(["launch", "refer"]);
	expect(prompts.every(({ type }) => type === "config_resource_delete")).toBe(
		true,
	);
});

test("reward and referral program changes appear in the push result", () => {
	const result = catalogPreviewToPushResult(preview) as any;

	expect(result.rewardsDeleted).toEqual(["launch"]);
	expect(result.rewardsUpdated).toEqual(["launch-updated"]);
	expect(result.referralProgramsDeleted).toEqual(["refer"]);
	expect(result.referralProgramsUpdated).toEqual(["refer-updated"]);
});
