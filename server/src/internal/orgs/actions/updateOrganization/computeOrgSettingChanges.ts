import {
	ORG_SETTING_KEYS,
	type OrgConfig,
	OrgConfigSchema,
	type OrgSettingChange,
	type OrgSettingsParams,
} from "@autumn/shared";

export const currentValueOf = ({
	config,
	key,
}: {
	config: OrgConfig;
	key: (typeof ORG_SETTING_KEYS)[number];
}): boolean => OrgConfigSchema.parse(config)[key];

const defaultValueOf = ({
	key,
}: {
	key: (typeof ORG_SETTING_KEYS)[number];
}): boolean => OrgConfigSchema.shape[key].def.defaultValue;

export const computeOrgSettingChanges = ({
	config,
	stated,
}: {
	config: OrgConfig;
	stated: OrgSettingsParams;
}): OrgSettingChange[] =>
	ORG_SETTING_KEYS.flatMap((key): OrgSettingChange[] => {
		const previous = currentValueOf({ config, key });
		const declared = stated[key];
		if (declared !== undefined) {
			return declared === previous
				? []
				: [{ key, action: "update", previous, current: declared }];
		}
		return previous === defaultValueOf({ key })
			? []
			: [{ key, action: "unmanaged", previous, current: null }];
	});
