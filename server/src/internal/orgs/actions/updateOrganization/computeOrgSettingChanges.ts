import {
	ORG_SETTING_KEYS,
	type OrgConfig,
	OrgConfigSchema,
	type OrgSettingChange,
	type OrgSettingsParams,
} from "@autumn/shared";

/**
 * The flag's value as the org holds it, defaults filled where it never set
 * one. `block_overdue_entitlements` is read the way the runtime reads it: its
 * deprecated twin `include_past_due` still blocks when it alone is set.
 */
export const currentValueOf = ({
	config,
	key,
}: {
	config: OrgConfig;
	key: (typeof ORG_SETTING_KEYS)[number];
}): boolean => {
	const parsed = OrgConfigSchema.parse(config);
	if (key === "block_overdue_entitlements")
		return parsed.block_overdue_entitlements || !parsed.include_past_due;
	return parsed[key];
};

const defaultValueOf = ({
	key,
}: {
	key: (typeof ORG_SETTING_KEYS)[number];
}): boolean => OrgConfigSchema.shape[key].def.defaultValue;

/**
 * What an update would move, and what it would leave behind. A stated flag
 * that differs is an `update`; an unstated one sitting off its default is
 * `unmanaged` — the update leaves it alone, and the preview says so.
 */
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
