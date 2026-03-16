import { Box, Text } from "ink";
import type { ApiReferral } from "../../types.js";
import { formatDate } from "../../types.js";

export interface ReferralsSectionProps {
	referrals: ApiReferral[];
}

/**
 * Renders customer referrals
 */
export function ReferralsSection({ referrals }: ReferralsSectionProps) {
	if (referrals.length === 0) {
		return (
			<Box flexDirection="column">
				<Text bold color="gray">
					Referrals
				</Text>
				<Text dimColor>No referrals</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold color="gray">
				Referrals ({referrals.length})
			</Text>
			<Box flexDirection="column" paddingLeft={1}>
				{referrals.slice(0, 5).map((referral) => (
					<ReferralRow
						key={`${referral.program_id}-${referral.customer.id}`}
						referral={referral}
					/>
				))}
				{referrals.length > 5 && (
					<Text dimColor>...and {referrals.length - 5} more</Text>
				)}
			</Box>
		</Box>
	);
}

function ReferralRow({ referral }: { referral: ApiReferral }) {
	const customerDisplay =
		referral.customer.name ?? referral.customer.email ?? referral.customer.id;

	return (
		<Box>
			<Text color={referral.reward_applied ? "green" : "yellow"}>
				{referral.reward_applied ? "✓ " : "○ "}
			</Text>
			<Text>{customerDisplay}</Text>
			<Text dimColor> - {formatDate(referral.created_at)}</Text>
			{!referral.reward_applied && <Text color="yellow"> (pending)</Text>}
		</Box>
	);
}
