import {
	bindStagingVariants,
	defaultStagingVariantsConfig,
	type StagingArm,
	variant,
} from "@autumn/edge-config";

/** Variants only go live on the staging admin bucket. */
const STAGING_BUCKET = "autumn-staging";

/** Binds the staging variants task-scoped, as a rung runs them, under an identity whose arm for `experiment` is `arm`. */
export function forceStagingArm({
	experiment,
	arm,
}: {
	experiment: string;
	arm: StagingArm;
}): void {
	const arms: StagingArm[] = arm === "A" ? ["A", "B"] : ["A", arm];
	function read() {
		return {
			...defaultStagingVariantsConfig(),
			experiments: { [experiment]: { arms, scope: "task" as const } },
		};
	}
	for (let identity = 0; ; identity++) {
		bindStagingVariants({
			read,
			identity: `t${identity}`,
			bucket: STAGING_BUCKET,
		});
		if (variant(experiment) === arm) return;
	}
}

/** No experiment live: every `variant()` is A again. */
export function clearStagingArms(): void {
	bindStagingVariants({
		read: defaultStagingVariantsConfig,
		identity: "",
		bucket: STAGING_BUCKET,
	});
}
