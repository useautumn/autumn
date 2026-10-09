import {
	type ApiByocCache,
	BYOC_CACHE_AWS_REGIONS,
	type ByocCacheAwsRegion,
	ByocStackNameSchema,
	type CreateByocCacheParams,
	DEFAULT_BYOC_CACHE_AWS_REGION,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { toast } from "sonner";
import { z } from "zod/v4";
import { useAppForm } from "@/hooks/form/form";
import { getBackendErr } from "@/utils/genUtils";
import {
	cacheToMachine,
	RECOMMENDED_ATOM_INSTANCE_TYPE,
} from "./atomMachineDisplay";
import type { AtomActions } from "./useAtomActions";

/** Subnets are typed as one comma- or space-separated line. */
const toSubnetIds = (subnets: string) =>
	subnets.split(/[\s,]+/).filter(Boolean);

const AtomSetupSchema = z
	.object({
		instanceType: z.string(),
		region: z.enum(BYOC_CACHE_AWS_REGIONS),
		vpc: z.enum(["existing_vpc", "new_vpc"]),
		vpcId: z.string().trim(),
		subnets: z.string(),
		stackName: ByocStackNameSchema,
	})
	.refine(({ vpc, vpcId }) => vpc === "new_vpc" || vpcId.startsWith("vpc-"), {
		message: "Enter a VPC ID like vpc-0a1b2c3d",
		path: ["vpcId"],
	})
	.refine(
		({ vpc, subnets }) => {
			const subnetIds = toSubnetIds(subnets);
			return (
				vpc === "new_vpc" ||
				(subnetIds.length > 0 &&
					subnetIds.every((subnetId) => subnetId.startsWith("subnet-")))
			);
		},
		{
			message: "Add subnet IDs like subnet-0aa1, subnet-0bb2",
			path: ["subnets"],
		},
	);

export type AtomSetupValues = z.infer<typeof AtomSetupSchema>;

const isAwsRegion = (region: string | null): region is ByocCacheAwsRegion =>
	BYOC_CACHE_AWS_REGIONS.some((awsRegion) => awsRegion === region);

/** A setup in progress reopens with what it asked for; a new one starts from the recommended size in a new VPC. */
const cacheToSetupValues = ({
	cache,
	stackNameBase,
}: {
	cache: ApiByocCache | null;
	stackNameBase: string;
}): AtomSetupValues => {
	const network = cache?.network;
	const region = cache?.region ?? null;
	const isExistingVpc = network?.type === "existing_vpc";
	return {
		instanceType:
			(cache && cacheToMachine(cache)?.instanceType) ??
			RECOMMENDED_ATOM_INSTANCE_TYPE,
		region: isAwsRegion(region) ? region : DEFAULT_BYOC_CACHE_AWS_REGION,
		vpc: isExistingVpc ? "existing_vpc" : "new_vpc",
		vpcId: network?.type === "existing_vpc" ? network.vpc_id : "",
		subnets:
			network?.type === "existing_vpc" ? network.subnet_ids.join(", ") : "",
		stackName: stackNameBase,
	};
};

const setupValuesToCreateParams = (
	values: AtomSetupValues,
): CreateByocCacheParams => {
	const machine = findByocCacheMachineByInstanceType({
		instanceType: values.instanceType,
	});
	return {
		cpu: machine?.cpu,
		memory: machine?.memory,
		region: values.region,
		stack_name: values.stackName.trim(),
		network:
			values.vpc === "new_vpc"
				? { type: "new_vpc" }
				: {
						type: "existing_vpc",
						vpc_id: values.vpcId.trim(),
						subnet_ids: toSubnetIds(values.subnets),
					},
	};
};

/** Cloud, size, network and stack name are one form; submitting it starts the setup and opens AWS. */
export const useAtomSetupForm = ({
	cache,
	stackNameBase,
	startSetup,
	onStarted,
}: {
	cache: ApiByocCache | null;
	stackNameBase: string;
	startSetup: AtomActions["startSetup"];
	onStarted: () => void;
}) =>
	useAppForm({
		defaultValues: cacheToSetupValues({ cache, stackNameBase }),
		validators: { onSubmit: AtomSetupSchema },
		onSubmit: async ({ value }) => {
			try {
				await startSetup(setupValuesToCreateParams(value));
				onStarted();
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to set up Atom"));
			}
		},
	});

export type AtomSetupForm = ReturnType<typeof useAtomSetupForm>;
