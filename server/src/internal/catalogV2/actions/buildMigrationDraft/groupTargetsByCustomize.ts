import { type DiffedCustomizePlanV1, customizeToKey } from "@autumn/shared";
import { toMigratableCustomize } from "./toMigratableCustomize";
import type { MigrationTarget } from "./types";

export type CustomizeTargetBucket = {
	customize: DiffedCustomizePlanV1;
	targets: MigrationTarget[];
};

const customizeBucketKey = ({
	customize,
	includeCustom,
}: {
	customize: DiffedCustomizePlanV1;
	includeCustom: boolean;
}): string =>
	`${customizeToKey({ customize })}|includeCustom:${includeCustom}`;

/** Bucket targets that share migratable customize and includeCustom. */
export const groupTargetsByCustomize = ({
	targets,
}: {
	targets: MigrationTarget[];
}): CustomizeTargetBucket[] => {
	const groups = new Map<string, CustomizeTargetBucket>();
	for (const target of targets) {
		const customize = toMigratableCustomize({ customize: target.customize });
		if (Object.keys(customize).length === 0) continue;

		const key = customizeBucketKey({
			customize,
			includeCustom: target.includeCustom,
		});
		const group = groups.get(key);
		if (group) {
			group.targets.push(target);
		} else {
			groups.set(key, { customize, targets: [target] });
		}
	}
	return [...groups.values()];
};
