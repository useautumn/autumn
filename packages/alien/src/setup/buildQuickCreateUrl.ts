import type { AlienNetwork } from "../types/alienClient.js";

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

/** CloudFormation's quick-create page in `region`, prefilled; the setup link's `token` registers the stack against that link. */
export const buildQuickCreateUrl = ({
	templateUrl,
	region,
	stackName,
	token,
	network,
}: {
	templateUrl: string;
	region: string;
	stackName: string;
	token: string;
	network: AlienNetwork | null;
}): string => {
	const stackParams = { Token: token, ...networkToStackParams({ network }) };
	const query = new URLSearchParams({ templateURL: templateUrl, stackName });
	for (const [name, value] of Object.entries(stackParams))
		query.set(`param_${name}`, value);
	return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/quickcreate?${query}`;
};
