/**
 * Generate imports for config file
 */
export function buildImports({
	includeBillingControls = false,
	includeRewards = false,
	includeReferralPrograms = false,
}: {
	includeBillingControls?: boolean;
	includeRewards?: boolean;
	includeReferralPrograms?: boolean;
} = {}): string {
	const imports = ["feature", "item", "plan"];
	if (includeBillingControls) imports.unshift("billingControls");
	if (includeRewards) imports.push("reward");
	if (includeReferralPrograms) imports.push("referralProgram");
	return `import { ${imports.join(", ")} } from 'atmn';`;
}
