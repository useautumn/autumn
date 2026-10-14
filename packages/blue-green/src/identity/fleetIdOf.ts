export function fleetIdOf({ serviceArn }: { serviceArn: string }): string {
	return new Bun.CryptoHasher("sha256")
		.update(serviceArn)
		.digest("hex")
		.slice(0, 8);
}
