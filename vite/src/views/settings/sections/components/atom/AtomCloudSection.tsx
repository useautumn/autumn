import {
	BYOC_CACHE_AWS_REGIONS,
	type ByocCacheAwsRegion,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import {
	Button,
	GroupedTabButton,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { LabelTag } from "@/components/general/LabelTag";
import { AtomFieldRow } from "./AtomFieldRow";
import { AtomMachineTable } from "./AtomMachineTable";
import { type AtomSectionState, AtomSetupSection } from "./AtomSetupSection";
import { atomMachineLabel } from "./atomMachineDisplay";
import type { AtomSetupForm, AtomSetupValues } from "./useAtomSetupForm";

const PROVIDER_OPTIONS = [
	{ value: "aws", label: "AWS" },
	{
		value: "gcp",
		label: (
			<span className="flex items-center gap-1.5">
				GCP
				<LabelTag label="SOON" />
			</span>
		),
		disabled: true,
	},
];

const cloudSummary = ({ instanceType, region }: AtomSetupValues) => {
	const machine = findByocCacheMachineByInstanceType({ instanceType });
	return ["AWS", region, machine && atomMachineLabel(machine)]
		.filter(Boolean)
		.join(" · ");
};

/** Step 1: the cloud, its region and Atom's size. */
export const AtomCloudSection = ({
	form,
	state,
	onContinue,
	onEdit,
}: {
	form: AtomSetupForm;
	state: AtomSectionState;
	onContinue: () => void;
	onEdit: () => void;
}) => (
	<form.Subscribe selector={(formState) => formState.values}>
		{(values) => (
			<AtomSetupSection
				step={1}
				title="Cloud & size"
				state={state}
				summary={cloudSummary(values)}
				onEdit={onEdit}
				footer={
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
						className="w-56"
					/>
				</AtomFieldRow>
				<AtomFieldRow label="Region" isMuted>
					<form.Field name="region">
						{(field) => (
							<Select
								value={field.state.value}
								onValueChange={(region) =>
									field.handleChange(region as ByocCacheAwsRegion)
								}
							>
								<SelectTrigger className="w-56 font-mono text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{BYOC_CACHE_AWS_REGIONS.map((region) => (
										<SelectItem
											key={region}
											value={region}
											className="font-mono text-xs"
										>
											{region}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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
									onSelect={(machine) =>
										field.handleChange(machine.instanceType)
									}
								/>
							)
						);
					}}
				</form.Field>
			</AtomSetupSection>
		)}
	</form.Subscribe>
);
