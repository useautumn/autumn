/**
 * A fleet is an ECS service; its id is the first 8 hex of sha256(service ARN). Both
 * Flightcontrol fleets receive the same env, so the ARN is the one thing that tells them apart.
 */
export function fleetIdOf({ serviceArn }: { serviceArn: string }): string {
	return new Bun.CryptoHasher("sha256")
		.update(serviceArn)
		.digest("hex")
		.slice(0, 8);
}
