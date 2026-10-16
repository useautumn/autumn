import type {
	AlienContainerResources,
	AlienFixedPools,
	AlienNetwork,
} from "../types/alienClient.js";

/** The template's network parameters; a new VPC serves its endpoints over the internet, an existing one keeps them private to it. */
const networkToStackParams = ({
	network,
}: {
	network: AlienNetwork | null;
}): Record<string, string> => {
	if (!network) return {};
	if (network.type === "create")
		return { NetworkMode: "create-new", EndpointAccess: "internet" };
	return {
		NetworkMode: "use-existing",
		VpcId: network.vpc_id,
		PublicSubnetIds: network.public_subnet_ids.join(","),
		PrivateSubnetIds: network.private_subnet_ids.join(","),
		EndpointAccess: "private",
	};
};

/** A resource id as alien's template generator names its parameters: alphanumeric runs, each capitalised. */
const toTemplateIdentifier = (id: string) =>
	id
		.split(/[^a-zA-Z0-9]+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");

/** Each pool's machine type and count, as the template names them: `Compute<Pool>Machine(s)`. */
const poolsToStackParams = ({
	pools,
}: {
	pools: AlienFixedPools;
}): Record<string, string> =>
	Object.fromEntries(
		Object.entries(pools).flatMap(([id, { machine, machines }]) => {
			const pool = `Compute${toTemplateIdentifier(id)}`;
			return [
				[`${pool}Machine`, machine],
				[`${pool}Machines`, String(machines)],
			];
		}),
	);

/** Each container's allocation, as a release with resource ranges and a volume names it: `Container<Id>Cpu`, `Container<Id>Memory` and `Container<Id>VolumeSizeGib`. */
const containersToStackParams = ({
	containers,
}: {
	containers: AlienContainerResources;
}): Record<string, string> =>
	Object.fromEntries(
		Object.entries(containers).flatMap(
			([id, { cpu, memory, volumeSizeGib }]) => {
				const container = `Container${toTemplateIdentifier(id)}`;
				return [
					[`${container}Cpu`, String(cpu)],
					[`${container}Memory`, memory],
					[`${container}VolumeSizeGib`, String(volumeSizeGib)],
				];
			},
		),
	);

/** CloudFormation's quick-create page in `region`, prefilled; the setup link's `token` registers the stack against that link, and the template needs alien's managing role. */
export const buildQuickCreateUrl = ({
	templateUrl,
	region,
	stackName,
	token,
	managingRoleArn,
	pools,
	containers,
	network,
}: {
	templateUrl: string;
	region: string;
	stackName: string;
	token: string;
	managingRoleArn: string;
	pools: AlienFixedPools;
	containers: AlienContainerResources;
	network: AlienNetwork | null;
}): string => {
	const stackParams = {
		Token: token,
		ManagingRoleArn: managingRoleArn,
		...poolsToStackParams({ pools }),
		...containersToStackParams({ containers }),
		...networkToStackParams({ network }),
	};
	const query = new URLSearchParams({ templateURL: templateUrl, stackName });
	for (const [name, value] of Object.entries(stackParams))
		query.set(`param_${name}`, value);
	return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/quickcreate?${query}`;
};
