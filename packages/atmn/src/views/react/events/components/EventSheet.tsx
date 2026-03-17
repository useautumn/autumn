import { Box, Text } from "ink";
import type { ApiEventsListItem } from "../../../../lib/hooks/useEvents.js";
import {
	DetailSheet,
	SheetSection,
	formatDate,
} from "../../primitives/index.js";

export interface EventSheetProps {
	event: ApiEventsListItem;
	isFocused: boolean;
	copiedFeedback: boolean;
}

/**
 * Event detail sheet (right panel).
 * Shows event details including properties.
 */
export function EventSheet({ event, isFocused, copiedFeedback }: EventSheetProps) {
	const hasProperties =
		event.properties && Object.keys(event.properties).length > 0;

	return (
		<DetailSheet
			title="Event Details"
			subtitle={event.id}
			isFocused={isFocused}
			actions={
				<Box flexDirection="column">
					{copiedFeedback ? (
						<Text color="green">Copied!</Text>
					) : (
						<Text>
							<Text color="magenta">[c]</Text>
							<Text color="gray"> Copy ID</Text>
						</Text>
					)}
				</Box>
			}
		>
			{/* Event Info */}
			<SheetSection title="Event Info">
				<Text>
					<Text color="gray">ID: </Text>
					<Text>{event.id}</Text>
				</Text>
				<Text>
					<Text color="gray">Timestamp: </Text>
					<Text>{formatDate(event.timestamp)}</Text>
				</Text>
				<Text>
					<Text color="gray">Customer: </Text>
					<Text>{event.customer_id}</Text>
				</Text>
				<Text>
					<Text color="gray">Feature: </Text>
					<Text>{event.feature_id}</Text>
				</Text>
				<Text>
					<Text color="gray">Value: </Text>
					<Text>{event.value}</Text>
				</Text>
			</SheetSection>

			{/* Properties (if not empty) */}
			{hasProperties && (
				<SheetSection title="Properties">
					<Text>{JSON.stringify(event.properties, null, 4)}</Text>
				</SheetSection>
			)}
		</DetailSheet>
	);
}
