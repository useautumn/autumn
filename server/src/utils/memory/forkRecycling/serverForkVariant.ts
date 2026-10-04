import {
	createTaskVariantAtBoot,
	stagingVariantsEnabled,
} from "@autumn/edge-config";
import {
	getAwsTaskArn,
	resolveAwsTaskIdentity,
} from "@/external/aws/ecs/awsTaskIdentity.js";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import { readStagingVariantsAtBoot } from "@/internal/misc/stagingVariants/stagingVariantsStore.js";
import { getServerForkCount } from "./recyclePolicy.js";

export const SERVER_FORK_EXPERIMENT = "server-forks";
let bootVariant: ReturnType<typeof createTaskVariantAtBoot> | undefined;

const taskIdentity = async () => {
	await resolveAwsTaskIdentity();
	return getAwsTaskArn();
};

const getBootVariant = () => {
	bootVariant ??= createTaskVariantAtBoot({
		bucket: getAdminS3Config().bucket,
		experiment: SERVER_FORK_EXPERIMENT,
		allowedArms: ["A", "B"],
		read: readStagingVariantsAtBoot,
		identity: taskIdentity,
	});
	return bootVariant;
};

export async function pinServerForkVariantAtBoot() {
	if (!stagingVariantsEnabled({ bucket: getAdminS3Config().bucket }))
		return getServerForkCount();
	const arm = await getBootVariant().read();
	if (arm === "B") process.env.SERVER_FORK_COUNT = "6";
	process.env.SERVER_FORK_VARIANT_ARM = arm;
	return getServerForkCount();
}

export function getServerForkBootArm(): "A" | "B" | null {
	if (!stagingVariantsEnabled({ bucket: getAdminS3Config().bucket }))
		return null;
	const arm = process.env.SERVER_FORK_VARIANT_ARM;
	return arm === "A" || arm === "B" ? arm : null;
}
