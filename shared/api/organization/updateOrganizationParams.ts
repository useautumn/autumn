import { JSON_SCHEMA_REGISTRY } from "@orpc/zod/zod4";
import { z } from "zod/v4";
import { OrgConfigSchema } from "../../models/orgModels/orgConfig.js";
import {
	ORG_SETTING_KEYS,
	ORG_SETTINGS_LABELS,
	type OrgSettingKey,
} from "../../utils/orgUtils/orgSettingsLabels.js";

/**
 * A stated flag is written; an omitted one is left alone. `OrgConfigSchema`'s
 * `.default()`s are stripped so parsing never fills a flag the caller never
 * sent, and the default is carried on the spec instead, where the CLI reads it.
 */
const settingField = ({ key }: { key: OrgSettingKey }) => {
	const field = OrgConfigSchema.shape[key];
	const stated = field.removeDefault().optional();
	// The registry entry replaces the global meta, so the description lives here too.
	JSON_SCHEMA_REGISTRY.add(stated, {
		description: `${ORG_SETTINGS_LABELS[key]}.`,
		default: field.def.defaultValue,
	});
	return stated;
};

export const OrgSettingsParamsSchema = z.object(
	Object.fromEntries(
		ORG_SETTING_KEYS.map((key) => [key, settingField({ key })]),
	) as { [K in OrgSettingKey]: ReturnType<typeof settingField> },
);

export type OrgSettingsParams = z.infer<typeof OrgSettingsParamsSchema>;

export const UpdateOrganizationParamsSchema = z.object({
	config: OrgSettingsParamsSchema.optional().meta({
		description:
			"Org settings to set. Only the flags stated are written; every other flag keeps its value.",
	}),
});

export type UpdateOrganizationParams = z.infer<
	typeof UpdateOrganizationParamsSchema
>;

export const PreviewUpdateOrganizationParamsSchema =
	UpdateOrganizationParamsSchema;
