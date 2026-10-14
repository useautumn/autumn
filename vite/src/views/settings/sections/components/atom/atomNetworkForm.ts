import type { ByocCacheNetwork } from "@autumn/shared";
import { z } from "zod/v4";

const toSubnetIds = (subnets: string) =>
	subnets.split(/[\s,]+/).filter(Boolean);

export const AtomNetworkValuesSchema = z.object({
	vpc: z.enum(["existing_vpc", "new_vpc"]),
	vpcId: z.string().trim(),
	subnets: z.string(),
});

export type AtomNetworkValues = z.infer<typeof AtomNetworkValuesSchema>;

export const withAtomNetworkRules = <T extends z.ZodType<AtomNetworkValues>>(
	schema: T,
) =>
	schema
		.refine(({ vpc, vpcId }) => vpc === "new_vpc" || vpcId.startsWith("vpc-"), {
			message: "Enter a VPC ID like vpc-0a1b2c3d",
			path: ["vpcId"],
		})
		.refine(
			({ vpc, subnets }) => {
				const subnetIds = toSubnetIds(subnets);
				return (
					vpc === "new_vpc" ||
					(subnetIds.length > 0 &&
						subnetIds.every((subnetId) => subnetId.startsWith("subnet-")))
				);
			},
			{
				message: "Add subnet IDs like subnet-0aa1, subnet-0bb2",
				path: ["subnets"],
			},
		);

export const networkToAtomNetworkValues = (
	network: ByocCacheNetwork | null | undefined,
): AtomNetworkValues =>
	network?.type === "existing_vpc"
		? {
				vpc: "existing_vpc",
				vpcId: network.vpc_id,
				subnets: network.subnet_ids.join(", "),
			}
		: { vpc: "new_vpc", vpcId: "", subnets: "" };

export const atomNetworkValuesToNetwork = ({
	vpc,
	vpcId,
	subnets,
}: AtomNetworkValues): ByocCacheNetwork =>
	vpc === "new_vpc"
		? { type: "new_vpc" }
		: {
				type: "existing_vpc",
				vpc_id: vpcId.trim(),
				subnet_ids: toSubnetIds(subnets),
			};
