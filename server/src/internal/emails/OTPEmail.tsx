import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

const OTPEmail = (props: { otpCode: string }) => {
	return (
		<Html lang="en" dir="ltr">
			<Tailwind>
				<Head />
				<Body className="bg-white font-sans">
					<Container className="bg-white max-w-[600px] mx-auto px-[40px] py-[40px]">
						<Heading className="text-gray-900 text-[24px] font-bold mb-[24px]">
							Verification code
						</Heading>

						<Text className="text-gray-800 text-[16px] leading-[24px] mb-[24px]">
							Enter the following verification code when prompted:
						</Text>

						<Text className="text-[32px] font-bold text-gray-900 font-mono mb-[24px]">
							{props.otpCode}
						</Text>

						<Text className="text-gray-800 text-[16px] leading-[24px] mb-[40px]">
							To protect your account, do not share this code.
						</Text>

						{/* Footer */}
						<Section className="border-t border-gray-200 pt-[24px]">
							<Text className="text-gray-500 text-[12px] leading-[16px] m-0">
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
};

OTPEmail.PreviewProps = {
	otpCode: "884085",
};

export default OTPEmail;
