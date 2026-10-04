import {
	armForWindow,
	bindStagingVariants,
	defaultStagingVariantsConfig,
	type StagingArm,
} from "@autumn/edge-config";

/** Variants only go live on the staging admin bucket. */
const STAGING_BUCKET = "autumn-staging";

/** Binds the staging variants so `experiment` runs `arm` in every window: an identity whose hash picks it, a frozen clock. */
export function forceStagingArm({
	experiment,
	arm,
}: {
	experiment: string;
	arm: StagingArm;
}): void {
	const arms: StagingArm[] = arm === "A" ? ["A", "B"] : ["A", arm];
	let identity = 0;
	while (
		armForWindow({
			identity: `t${identity}`,
			windowIndex: 0,
			experiment,
			arms,
		}) !== arm
	)
		identity++;
	bindStagingVariants({
		read: () => ({
			...defaultStagingVariantsConfig(),
			experiments: { [experiment]: { arms } },
		}),
		identity: `t${identity}`,
		bucket: STAGING_BUCKET,
		now: () => 0,
	});
}

/** No experiment live: every `variant()` is A again. */
export function clearStagingArms(): void {
	bindStagingVariants({
		read: defaultStagingVariantsConfig,
		identity: "",
		bucket: STAGING_BUCKET,
	});
}
