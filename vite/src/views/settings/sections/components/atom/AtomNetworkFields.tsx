import { GroupedTabButton, Input } from "@autumn/ui";
import { FieldInfo } from "@/components/general/form/field-info";
import { withFieldGroup } from "@/hooks/form/form";
import { AtomFieldRow } from "./AtomFieldRow";
import { ATOM_NETWORKS } from "./atomNetworkDisplay";
import {
	type AtomNetworkValues,
	networkToAtomNetworkValues,
} from "./atomNetworkForm";

const VPC_OPTIONS = [
	{ value: "new_vpc", label: "New VPC" },
	{ value: "existing_vpc", label: "Existing VPC" },
];

export const ATOM_NETWORK_FIELDS = {
	vpc: "vpc",
	vpcId: "vpcId",
	subnets: "subnets",
} as const;

export const AtomNetworkFields = withFieldGroup({
	defaultValues: networkToAtomNetworkValues(null),
	render: function AtomNetworkFieldsRender({ group }) {
		return (
			<group.Subscribe selector={(state) => state.values.vpc}>
				{(vpc) => (
					<>
						<AtomFieldRow label="VPC" isMuted>
							<group.Field name="vpc">
								{(field) => (
									<div className="flex flex-col gap-1.5 py-1">
										<GroupedTabButton
											value={field.state.value}
											onValueChange={(value) =>
												field.handleChange(value as AtomNetworkValues["vpc"])
											}
											options={VPC_OPTIONS}
											className="w-80"
										/>
										<span className="text-xs text-tertiary-foreground">
											{ATOM_NETWORKS[field.state.value].hint}
										</span>
									</div>
								)}
							</group.Field>
						</AtomFieldRow>
						{vpc === "existing_vpc" && (
							<>
								<AtomFieldRow label="VPC ID" isMuted>
									<group.Field name="vpcId">
										{(field) => (
											<div className="flex w-80 flex-col gap-1">
												<Input
													aria-label="VPC ID"
													className="font-mono text-xs"
													placeholder="vpc-0a1b2c3d4e5f6a7b8"
													value={field.state.value}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
												/>
												<FieldInfo field={field} />
											</div>
										)}
									</group.Field>
								</AtomFieldRow>
								<AtomFieldRow label="Subnets" isMuted>
									<group.Field name="subnets">
										{(field) => (
											<div className="flex w-80 flex-col gap-1">
												<Input
													aria-label="Subnet IDs"
													className="font-mono text-xs"
													placeholder="subnet-0aa1, subnet-0bb2"
													value={field.state.value}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
												/>
												<FieldInfo field={field} />
											</div>
										)}
									</group.Field>
								</AtomFieldRow>
							</>
						)}
					</>
				)}
			</group.Subscribe>
		);
	},
});
