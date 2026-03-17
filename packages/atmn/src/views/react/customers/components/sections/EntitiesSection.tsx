import { Box, Text } from "ink";
import type { ApiEntity } from "../../types.js";

export interface EntitiesSectionProps {
	entities: ApiEntity[];
}

/**
 * Renders customer entities
 */
export function EntitiesSection({ entities }: EntitiesSectionProps) {
	if (entities.length === 0) {
		return (
			<Box flexDirection="column">
				<Text bold color="gray">
					Entities
				</Text>
				<Text dimColor>No entities</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold color="gray">
				Entities ({entities.length})
			</Text>
			<Box flexDirection="column" paddingLeft={1}>
				{entities.slice(0, 10).map((entity, index) => (
					<EntityRow key={entity.id ?? index} entity={entity} />
				))}
				{entities.length > 10 && (
					<Text dimColor>...and {entities.length - 10} more</Text>
				)}
			</Box>
		</Box>
	);
}

function EntityRow({ entity }: { entity: ApiEntity }) {
	const displayName = entity.name ?? entity.id ?? "Unknown";

	return (
		<Box>
			<Text color="gray">- </Text>
			<Text>{displayName}</Text>
			{entity.feature_id && <Text dimColor> ({entity.feature_id})</Text>}
		</Box>
	);
}
