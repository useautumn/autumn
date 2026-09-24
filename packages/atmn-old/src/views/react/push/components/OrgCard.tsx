import type { OrganizationInfo } from "../../../../lib/hooks/useOrganization.js";
import { Card, KeyValue, LoadingText } from "../../components/index.js";

interface OrgCardProps {
	orgInfo: OrganizationInfo | null;
	isLoading: boolean;
}

/**
 * Organization info card
 */
export function OrgCard({ orgInfo, isLoading }: OrgCardProps) {
	if (isLoading) {
		return (
			<Card title="📦 Organization">
				<LoadingText text="Fetching..." />
			</Card>
		);
	}

	if (!orgInfo) {
		return null;
	}

	return (
		<Card title="📦 Organization">
			<KeyValue label="Name" value={orgInfo.name} />
			<KeyValue label="Environment" value={orgInfo.environment} />
		</Card>
	);
}
