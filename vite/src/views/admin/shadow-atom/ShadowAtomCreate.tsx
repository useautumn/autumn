import {
	BYOC_CACHE_MACHINES,
	type ByocCacheNetwork,
	DEFAULT_BYOC_CACHE_MACHINE,
	DEFAULT_BYOC_CACHE_VOLUME_GIB,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { toast } from "sonner";
import { z } from "zod/v4";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { useAppForm } from "@/hooks/form/form";
import { getBackendErr } from "@/utils/genUtils";
import { AtomMachineTable } from "@/views/settings/sections/components/atom/AtomMachineTable";
import {
	ATOM_NETWORK_FIELDS,
	AtomNetworkFields,
} from "@/views/settings/sections/components/atom/AtomNetworkFields";
import {
	AtomNetworkValuesSchema,
	atomNetworkValuesToNetwork,
	networkToAtomNetworkValues,
	withAtomNetworkRules,
} from "@/views/settings/sections/components/atom/atomNetworkForm";
import type { AtomActions } from "@/views/settings/sections/components/atom/useAtomActions";

/** Our staging VPC (the one the staging server and herald run in) and its private subnets, so the shadow Atom is reached privately by default. */
const STAGING_VPC_NETWORK: ByocCacheNetwork = {
	type: "existing_vpc",
	vpc_id: "vpc-0dbbff047f93713f0",
	subnet_ids: ["subnet-08f6e3d914ed3d70b", "subnet-0d1a13d95078208c4"],
};

const ShadowAtomCreateValuesSchema = AtomNetworkValuesSchema.extend({
	instanceType: z.string(),
});
const ShadowAtomCreateSchema = withAtomNetworkRules(
	ShadowAtomCreateValuesSchema,
);

const DEFAULT_VALUES: z.infer<typeof ShadowAtomCreateValuesSchema> = {
	instanceType: DEFAULT_BYOC_CACHE_MACHINE.instanceType,
	...networkToAtomNetworkValues(STAGING_VPC_NETWORK),
};

/** Nothing deployed: pick its size and network, and creating it opens the quick-create link for our own AWS account. */
export const ShadowAtomCreate = ({ actions }: { actions: AtomActions }) => {
	const form = useAppForm({
		defaultValues: DEFAULT_VALUES,
		validators: { onSubmit: ShadowAtomCreateSchema },
		onSubmit: async ({ value }) => {
			const machine =
				findByocCacheMachineByInstanceType({
					instanceType: value.instanceType,
				}) ?? DEFAULT_BYOC_CACHE_MACHINE;
			try {
				await actions.startSetup({
					cpu: machine.cpu,
					memory: machine.memory,
					network: atomNetworkValuesToNetwork(value),
				});
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to create the shadow Atom"));
			}
		},
	});

	return (
		<div className="flex flex-col gap-3">
			<div className={TABLE_TRAY_CLASS}>
				<div className={TABLE_TRAY_SURFACE_CLASS}>
					<form.Field name="instanceType">
						{(field) => (
							<AtomMachineTable
								selected={
									findByocCacheMachineByInstanceType({
										instanceType: field.state.value,
									}) ?? BYOC_CACHE_MACHINES[0]
								}
								volumeSizeGib={DEFAULT_BYOC_CACHE_VOLUME_GIB}
								onSelect={(machine) => field.handleChange(machine.instanceType)}
								disabled={actions.create.isPending}
							/>
						)}
					</form.Field>
				</div>
			</div>
			<div className={TABLE_TRAY_CLASS}>
				<div className={TABLE_TRAY_SURFACE_CLASS}>
					<AtomNetworkFields form={form} fields={ATOM_NETWORK_FIELDS} />
				</div>
			</div>
			<Button
				variant="primary"
				className="self-end"
				onClick={() => form.handleSubmit()}
				isLoading={actions.create.isPending}
			>
				Create shadow Atom
			</Button>
		</div>
	);
};
