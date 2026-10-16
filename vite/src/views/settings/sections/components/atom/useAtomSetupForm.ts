import {
	type ApiByocCache,
	BYOC_CACHE_AWS_REGIONS,
	type ByocCacheAwsRegion,
	ByocStackNameSchema,
	type CreateByocCacheParams,
	DEFAULT_BYOC_CACHE_AWS_REGION,
	DEFAULT_BYOC_CACHE_VOLUME_GIB,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { toast } from "sonner";
import { z } from "zod/v4";
import { useAppForm } from "@/hooks/form/form";
import { getBackendErr } from "@/utils/genUtils";
import {
	cacheToMachine,
	DEFAULT_ATOM_INSTANCE_TYPE,
} from "./atomMachineDisplay";
import {
	AtomNetworkValuesSchema,
	atomNetworkValuesToNetwork,
	networkToAtomNetworkValues,
	withAtomNetworkRules,
} from "./atomNetworkForm";
import { atomVolumeSize, volumeSizeToChoice } from "./atomVolumeDisplay";
import type { AtomActions } from "./useAtomActions";

const AtomSetupSchema = withAtomNetworkRules(
	AtomNetworkValuesSchema.extend({
		name: z.string().trim().max(64, "Keep it under 64 characters"),
		instanceType: z.string(),
		region: z.enum(BYOC_CACHE_AWS_REGIONS),
		volume: z.object({
			presetGib: z.number().nullable(),
			customGib: z.string(),
		}),
		stackName: ByocStackNameSchema,
	}),
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
	const region = cache?.region ?? null;
	return {
		name: cache?.name ?? "",
		instanceType:
			(cache && cacheToMachine(cache)?.instanceType) ??
			DEFAULT_ATOM_INSTANCE_TYPE,
		region: isAwsRegion(region) ? region : DEFAULT_BYOC_CACHE_AWS_REGION,
		volume: volumeSizeToChoice(
			cache?.volume_size_gib ?? DEFAULT_BYOC_CACHE_VOLUME_GIB,
		),
		...networkToAtomNetworkValues(cache?.network),
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
		name: values.name.trim() || undefined,
		cpu: machine?.cpu,
		memory: machine?.memory,
		region: values.region,
		volume_size_gib: atomVolumeSize({ choice: values.volume }).gib ?? undefined,
		stack_name: values.stackName.trim(),
		network: atomNetworkValuesToNetwork(values),
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
				await startSetup({
					...setupValuesToCreateParams(value),
					atom_id: cache?.id,
				});
				onStarted();
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to set up Atom"));
			}
		},
	});

export type AtomSetupForm = ReturnType<typeof useAtomSetupForm>;
