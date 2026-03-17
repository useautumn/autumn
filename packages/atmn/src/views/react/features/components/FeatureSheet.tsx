import { Box, Text } from "ink";
import type { ApiFeature } from "../../../../lib/api/types/index.js";
import { SheetSection } from "../../primitives/index.js";

export interface FeatureSheetProps {
	feature: ApiFeature;
	isFocused: boolean;
	copiedFeedback: boolean;
	onCopy: () => void;
	onOpenInBrowser: () => void;
}

/**
 * Feature detail sheet (right panel).
 * Shows feature details including type, event names, and credit schema.
 */
export function FeatureSheet({
	feature,
	isFocused,
	copiedFeedback,
	onCopy: _onCopy,
	onOpenInBrowser: _onOpenInBrowser,
}: FeatureSheetProps) {
	const borderColor = isFocused ? "magenta" : "gray";

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={borderColor}
			paddingX={1}
			minWidth={44}
			height="100%"
		>
			{/* Feature Title */}
			<Text bold color="white">
				{feature.name}
			</Text>

			{/* Basic Info Section */}
			<SheetSection title="Basic Info">
				<Text>
					<Text color="gray">ID: </Text>
					<Text>{feature.id}</Text>
				</Text>
				<Text>
					<Text color="gray">Name: </Text>
					<Text>{feature.name}</Text>
				</Text>
				<Text>
					<Text color="gray">Type: </Text>
					<Text>{feature.type}</Text>
				</Text>
				<Text>
					<Text color="gray">Consumable: </Text>
					<Text color={feature.consumable ? "green" : "gray"}>
						{feature.consumable ? "Yes" : "No"}
					</Text>
				</Text>
				<Text>
					<Text color="gray">Status: </Text>
					<Text color={feature.archived ? "red" : "green"}>
						{feature.archived ? "Archived" : "Active"}
					</Text>
				</Text>
			</SheetSection>

			{/* Display Section */}
			{feature.display &&
				(feature.display.singular || feature.display.plural) && (
					<SheetSection title="Display">
						{feature.display.singular && (
							<Text>
								<Text color="gray">Singular: </Text>
								<Text>{feature.display.singular}</Text>
							</Text>
						)}
						{feature.display.plural && (
							<Text>
								<Text color="gray">Plural: </Text>
								<Text>{feature.display.plural}</Text>
							</Text>
						)}
					</SheetSection>
				)}

			{/* Event Names Section (for metered features) */}
			{feature.type === "metered" &&
				feature.event_names &&
				feature.event_names.length > 0 && (
					<SheetSection title="Event Names">
						{feature.event_names.map((eventName: string, index: number) => (
							<Text key={eventName}>
								<Text color="gray">{index + 1}. </Text>
								<Text>{eventName}</Text>
							</Text>
						))}
					</SheetSection>
				)}

			{/* Credit Schema Section (for credit_system features) */}
			{feature.type === "credit_system" &&
				feature.credit_schema &&
				feature.credit_schema.length > 0 && (
					<SheetSection title="Credit Schema">
						{feature.credit_schema.map((item: { metered_feature_id: string; credit_cost: number }, index: number) => (
							<Box key={item.metered_feature_id} flexDirection="column">
								<Text>
									<Text color="gray">{index + 1}. </Text>
									<Text bold>{item.metered_feature_id}</Text>
								</Text>
								<Box paddingLeft={2}>
									<Text>
										<Text color="gray">Credit Cost: </Text>
										<Text color="cyan">{item.credit_cost}</Text>
									</Text>
								</Box>
							</Box>
						))}
					</SheetSection>
				)}

			{/* Spacer to push actions to bottom */}
			<Box flexGrow={1} />

			{/* Actions - pinned to bottom */}
			<Box flexDirection="column">
				{copiedFeedback ? (
					<Text color="green">Copied!</Text>
				) : (
					<Text>
						<Text color="magenta">[c]</Text>
						<Text color="gray"> Copy ID</Text>
					</Text>
				)}
				<Text>
					<Text color="magenta">[o]</Text>
					<Text color="gray"> Open in Autumn</Text>
				</Text>
			</Box>
		</Box>
	);
}
