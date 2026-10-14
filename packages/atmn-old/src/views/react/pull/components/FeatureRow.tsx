import { Text } from "ink";
import type { Feature } from "../../../../compose/models/index.js";

interface FeatureRowProps {
	feature: Feature;
}

export function FeatureRow({ feature }: FeatureRowProps) {
	return (
		<Text>
			<Text color="green">✓</Text> {feature.id}{" "}
			<Text color="gray">{feature.type}</Text>
		</Text>
	);
}
