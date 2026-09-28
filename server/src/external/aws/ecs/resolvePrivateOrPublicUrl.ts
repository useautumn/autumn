import { onAwsEcs } from "./onAwsEcs.js";

/** Private/VPC endpoints are only reachable from inside AWS — pick the private
 *  URL on ECS when one exists, the public one everywhere else. */
export const resolvePrivateOrPublicUrl = ({
	privateUrl,
	publicUrl,
}: {
	privateUrl: string | null | undefined;
	publicUrl: string;
}): string => (onAwsEcs() && privateUrl ? privateUrl : publicUrl);
