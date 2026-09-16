import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

const AgentClaimEmail = ({
	organizationName,
	claimUrl,
	expiresAt,
}: {
	organizationName: string;
	claimUrl: string;
	expiresAt: Date;
}) => (
	<Html lang="en" dir="ltr">
		<Tailwind>
			<Head />
			<Body className="bg-white font-sans">
				<Container className="mx-auto max-w-[600px] bg-white px-[40px] py-[40px]">
					<Heading className="mb-[16px] text-[24px] font-bold text-gray-900">
						Claim {organizationName}
					</Heading>
					<Text className="mb-[24px] text-[16px] leading-[24px] text-gray-800">
						An agent created this Autumn organization for you. Sign in with
						this email address to claim it and open the dashboard.
					</Text>
					<Button
						href={claimUrl}
						className="rounded-[8px] bg-gray-900 px-[20px] py-[12px] text-[15px] font-semibold text-white"
					>
						Sign in to claim
					</Button>
					<Text className="mt-[24px] text-[13px] leading-[20px] text-gray-500">
						This link expires {expiresAt.toUTCString()}. If you did not ask an
						agent to create this organization, you can ignore this email.
					</Text>
					<Section className="mt-[40px] border-t border-gray-200 pt-[24px]">
						<Text className="m-0 text-[12px] leading-[16px] text-gray-500">
							Autumn
							<br />
							2261 Market Street STE 22390
							<br />
							San Francisco, CA, US, 94114
						</Text>
					</Section>
				</Container>
			</Body>
		</Tailwind>
	</Html>
);

export default AgentClaimEmail;
