import {
	BYOC_CACHE_AWS_REGIONS,
	type ByocCacheAwsRegion,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { Button, GroupedTabButton, SearchableSelect } from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { LabelTag } from "@/components/general/LabelTag";
import { AtomFieldRow } from "./AtomFieldRow";
import { AtomMachineTable } from "./AtomMachineTable";
import { AtomSetupSection } from "./AtomSetupSection";
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

/** Step 1: the cloud, its region and Atom's size. */
export const AtomCloudSection = ({
	form,
	onContinue,
}: {
	form: AtomSetupForm;
	onContinue: () => void;
}) => (
	<AtomSetupSection
		actions={
			<Button variant="primary" onClick={onContinue}>
				Continue
				<ArrowRightIcon className="size-3.5" />
			</Button>
		}
	>
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
		<form.Field name="instanceType">
			{(field) => {
				const selected = findByocCacheMachineByInstanceType({
					instanceType: field.state.value,
				});
				return (
					selected && (
						<AtomMachineTable
							selected={selected}
							onSelect={(machine) => field.handleChange(machine.instanceType)}
						/>
					)
				);
			}}
		</form.Field>
	</AtomSetupSection>
);
