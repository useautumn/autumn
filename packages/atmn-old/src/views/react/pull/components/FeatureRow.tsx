import { Text } from "ink";
import type { Feature } from "../../../../compose/models/index.js";

interface FeatureRowProps {
	feature: Feature;
}

/**
 * Displays a single feature with checkmark and type
 */
export function FeatureRow({ feature }: FeatureRowProps) {
	return (
		<Text>
			<Text color="green">✓</Text> {feature.id}{" "}
			<Text color="gray">{feature.type}</Text>
		</Text>
	);
}
