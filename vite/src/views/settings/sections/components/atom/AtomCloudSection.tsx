import {
	BYOC_CACHE_AWS_REGIONS,
	BYOC_CACHE_REPLICAS,
	type ByocCacheAwsRegion,
	type ByocCacheMachine,
	DEFAULT_BYOC_CACHE_MACHINE,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import {
	Button,
	GroupedTabButton,
	InfoTooltip,
	Input,
	SearchableSelect,
} from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { LabelTag } from "@/components/general/LabelTag";
import { AtomFieldRow } from "./AtomFieldRow";
import { AtomMachineTable } from "./AtomMachineTable";
import { AtomSetupSection } from "./AtomSetupSection";
import { AtomStorageField } from "./AtomStorageField";
import { atomMachineLabel } from "./atomMachineDisplay";
import { atomMonthlyCost, atomVolumeSize } from "./atomVolumeDisplay";
import type { AtomSetupForm } from "./useAtomSetupForm";

const PROVIDER_OPTIONS = [
	{ value: "aws", label: "AWS" },
	{
		value: "gcp",
		label: (
			<span className="flex items-center gap-1.5">
				GCP
				<LabelTag
					label="SOON"
					className="border-primary/30 text-primary dark:border-primary/30 dark:text-primary"
				/>
			</span>
		),
		disabled: true,
	},
];

/** What the picked size and storage cost a month, and what the setup creates, behind the estimate's info icon. */
const AtomEstimateDetails = ({
	machine,
	volumeSizeGib,
}: {
	machine: ByocCacheMachine;
	volumeSizeGib: number;
}) => {
	const { total, compute, storage } = atomMonthlyCost({
		machine,
		volumeSizeGib,
	});
	return (
		<div className="flex max-w-72 flex-col gap-1.5">
			<p>
				{compute} compute + {storage} storage = {total} a month, both replicas
				included.
			</p>
			<p>Billed directly by AWS at us-east-1 list prices.</p>
			<p>
				Created in your AWS account: {BYOC_CACHE_REPLICAS} EC2 instances,{" "}
				{BYOC_CACHE_REPLICAS} EBS volumes ({volumeSizeGib} GB gp3 each) and 1
				SQS queue.
			</p>
		</div>
	);
};

/** The footer's estimate: the month's total, its details behind an info icon. */
const AtomMonthlyEstimate = ({
	machine,
	volumeSizeGib,
}: {
	machine: ByocCacheMachine;
	volumeSizeGib: number;
}) => (
	<span className="flex items-center gap-1.5 pr-1.5 text-sm text-foreground tabular-nums">
		{atomMonthlyCost({ machine, volumeSizeGib }).total}/mo est.
		<InfoTooltip side="top" align="end">
			<AtomEstimateDetails machine={machine} volumeSizeGib={volumeSizeGib} />
		</InfoTooltip>
	</span>
);

/** The picked configuration in one muted line, e.g. `Medium · 50 GiB · 2 replicas`. */
const atomSetupSummary = ({
	machine,
	volumeSizeGib,
}: {
	machine: ByocCacheMachine;
	volumeSizeGib: number | null;
}) =>
	[
		atomMachineLabel(machine),
		volumeSizeGib !== null && `${volumeSizeGib} GiB`,
		`${BYOC_CACHE_REPLICAS} replicas`,
	]
		.filter(Boolean)
		.join(" · ");

/** Step 1: the Atom's name, its cloud and region, its size and its storage. */
export const AtomCloudSection = ({
	form,
	onContinue,
}: {
	form: AtomSetupForm;
	onContinue: () => void;
}) => {
	const { instanceType, volume } = useStore(
		form.store,
		(state) => state.values,
	);
	const machine =
		findByocCacheMachineByInstanceType({ instanceType }) ??
		DEFAULT_BYOC_CACHE_MACHINE;
	const volumeSize = atomVolumeSize({ choice: volume });

	return (
		<AtomSetupSection
			status={
				<span className="text-sm text-tertiary-foreground">
					{atomSetupSummary({ machine, volumeSizeGib: volumeSize.gib })}
				</span>
			}
			actions={
				<>
					{volumeSize.gib !== null && (
						<AtomMonthlyEstimate
							machine={machine}
							volumeSizeGib={volumeSize.gib}
						/>
					)}
					<Button
						variant="primary"
						onClick={onContinue}
						disabled={volumeSize.gib === null}
					>
						Continue
						<ArrowRightIcon className="size-3.5" />
					</Button>
				</>
			}
		>
			<AtomFieldRow label="Name" isMuted>
				<form.Field name="name">
					{(field) => (
						<Input
							aria-label="Name"
							placeholder="e.g. US East"
							className="w-80"
							value={field.state.value}
							onChange={(event) => field.handleChange(event.target.value)}
						/>
					)}
				</form.Field>
			</AtomFieldRow>
			<AtomFieldRow label="Provider" isMuted>
				<GroupedTabButton
					value="aws"
					onValueChange={() => {}}
					options={PROVIDER_OPTIONS}
					className="w-80"
				/>
			</AtomFieldRow>
			<AtomFieldRow label="Region" isMuted>
				<form.Field name="region">
					{(field) => (
						<SearchableSelect
							value={field.state.value}
							onValueChange={(region) =>
								field.handleChange(region as ByocCacheAwsRegion)
							}
							options={[...BYOC_CACHE_AWS_REGIONS]}
							getOptionValue={(region) => region}
							getOptionLabel={(region) => region}
							searchable
							searchPlaceholder="Search regions..."
							emptyText="No region found."
							triggerClassName="w-80 font-mono text-xs"
							contentClassName="font-mono text-xs"
						/>
					)}
				</form.Field>
			</AtomFieldRow>
			<AtomMachineTable
				selected={machine}
				volumeSizeGib={volumeSize.gib}
				onSelect={(selected) =>
					form.setFieldValue("instanceType", selected.instanceType)
				}
			/>
			<AtomStorageField
				choice={volume}
				size={volumeSize}
				onChange={(choice) => form.setFieldValue("volume", choice)}
			/>
		</AtomSetupSection>
	);
};
