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
	DEFAULT_ATOM_INSTANCE_TYPE,
} from "./atomMachineDisplay";
import {
	AtomNetworkValuesSchema,
	atomNetworkValuesToNetwork,
	networkToAtomNetworkValues,
	withAtomNetworkRules,
} from "./atomNetworkForm";
import type { AtomActions } from "./useAtomActions";

const AtomSetupSchema = withAtomNetworkRules(
	AtomNetworkValuesSchema.extend({
		instanceType: z.string(),
		region: z.enum(BYOC_CACHE_AWS_REGIONS),
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
		instanceType:
			(cache && cacheToMachine(cache)?.instanceType) ??
			DEFAULT_ATOM_INSTANCE_TYPE,
		region: isAwsRegion(region) ? region : DEFAULT_BYOC_CACHE_AWS_REGION,
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
		cpu: machine?.cpu,
		memory: machine?.memory,
		region: values.region,
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
