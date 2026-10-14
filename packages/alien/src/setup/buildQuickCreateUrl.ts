import type {
	AlienContainerResources,
	AlienFixedPools,
	AlienNetwork,
} from "../types/alienClient.js";

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

const toTemplateIdentifier = (id: string) =>
	id
		.split(/[^a-zA-Z0-9]+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");

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

const containersToStackParams = ({
	containers,
}: {
	containers: AlienContainerResources;
}): Record<string, string> =>
	Object.fromEntries(
		Object.entries(containers).flatMap(([id, { cpu, memory }]) => {
			const container = `Container${toTemplateIdentifier(id)}`;
			return [
				[`${container}Cpu`, String(cpu)],
				[`${container}Memory`, memory],
			];
		}),
	);

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
