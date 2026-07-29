/**
 * Generate imports for config file
 */
export function buildImports({
	includeBillingControls = false,
}: {
	includeBillingControls?: boolean;
} = {}): string {
	const imports = ["feature", "item", "plan"];
	if (includeBillingControls) imports.unshift("billingControls");
	return `import { ${imports.join(", ")} } from 'atmn';`;
}
