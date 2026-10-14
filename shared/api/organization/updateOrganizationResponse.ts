import { z } from "zod/v4";
import { ORG_SETTING_KEYS } from "../../utils/orgUtils/orgSettingsLabels.js";
import { OrgSettingsParamsSchema } from "./updateOrganizationParams.js";

export const OrgSettingChangeActionSchema = z.enum(["update", "unmanaged"]);

export type OrgSettingChangeAction = z.infer<
	typeof OrgSettingChangeActionSchema
>;

export const OrgSettingChangeSchema = z.object({
	key: z.enum(ORG_SETTING_KEYS),
	action: OrgSettingChangeActionSchema,
	previous: z.boolean(),
	current: z.boolean().nullable().meta({
		description: "The value after the update; null when the flag is unmanaged.",
	}),
});

export type OrgSettingChange = z.infer<typeof OrgSettingChangeSchema>;

export const PreviewUpdateOrganizationResponseSchema = z.object({
	config: z.object({
		changes: z.array(OrgSettingChangeSchema),
	}),
});

export type PreviewUpdateOrganizationResponse = z.infer<
	typeof PreviewUpdateOrganizationResponseSchema
>;

export const UpdateOrganizationResponseSchema = z.object({
	config: OrgSettingsParamsSchema.required().meta({
		description: "Every settable flag, as it stands after the update.",
	}),
});

export type UpdateOrganizationResponse = z.infer<
	typeof UpdateOrganizationResponseSchema
>;
