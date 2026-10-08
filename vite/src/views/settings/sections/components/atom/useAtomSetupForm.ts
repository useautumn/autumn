import {
	type ApiByocCache,
	BYOC_CACHE_AWS_REGIONS,
	type ByocCacheAwsRegion,
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

const AtomSetupSchema = z
	.object({
		instanceType: z.string(),
		region: z.enum(BYOC_CACHE_AWS_REGIONS),
		vpc: z.enum(["existing_vpc", "new_vpc"]),
		vpcId: z.string().trim(),
		subnetIds: z.array(z.string()),
	})
	.refine(({ vpc, vpcId }) => vpc === "new_vpc" || vpcId.startsWith("vpc-"), {
		message: "Enter a VPC ID like vpc-0a1b2c3d",
		path: ["vpcId"],
	})
	.refine(
		({ vpc, subnetIds }) =>
			vpc === "new_vpc" ||
			(subnetIds.length > 0 &&
				subnetIds.every((subnetId) => subnetId.startsWith("subnet-"))),
		{ message: "Add a subnet ID like subnet-0aa1", path: ["subnetIds"] },
	);

export type AtomSetupValues = z.infer<typeof AtomSetupSchema>;

const isAwsRegion = (region: string | null): region is ByocCacheAwsRegion =>
	BYOC_CACHE_AWS_REGIONS.some((awsRegion) => awsRegion === region);

/** A setup in progress reopens with what it asked for; a new one starts from the recommended size. */
const cacheToSetupValues = (cache: ApiByocCache | null): AtomSetupValues => {
	const network = cache?.network;
	const region = cache?.region ?? null;
	const isExistingVpc = network?.type !== "new_vpc";
	return {
		instanceType:
			(cache && cacheToMachine(cache)?.instanceType) ??
			RECOMMENDED_ATOM_INSTANCE_TYPE,
		region: isAwsRegion(region) ? region : DEFAULT_BYOC_CACHE_AWS_REGION,
		vpc: isExistingVpc ? "existing_vpc" : "new_vpc",
		vpcId: network?.type === "existing_vpc" ? network.vpc_id : "",
		subnetIds: network?.type === "existing_vpc" ? network.subnet_ids : [],
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
		network:
			values.vpc === "new_vpc"
				? { type: "new_vpc" }
				: {
						type: "existing_vpc",
						vpc_id: values.vpcId.trim(),
						subnet_ids: values.subnetIds,
					},
	};
};

/** Cloud, size and network are one form; submitting it starts the setup and opens AWS. */
export const useAtomSetupForm = ({
	cache,
	startSetup,
	onStarted,
}: {
	cache: ApiByocCache | null;
	startSetup: AtomActions["startSetup"];
	onStarted: () => void;
}) =>
	useAppForm({
		defaultValues: cacheToSetupValues(cache),
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
