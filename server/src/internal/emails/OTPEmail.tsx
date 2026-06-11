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
import type { ReactElement, ReactNode } from "react";

type EmailComponent = (props: {
	children?: ReactNode;
	[key: string]: unknown;
}) => ReactElement | null;

const EmailBody = Body as unknown as EmailComponent;
const EmailContainer = Container as unknown as EmailComponent;
const EmailHead = Head as unknown as EmailComponent;
const EmailHeading = Heading as unknown as EmailComponent;
const EmailHtml = Html as unknown as EmailComponent;
const EmailSection = Section as unknown as EmailComponent;
const EmailTailwind = Tailwind as unknown as EmailComponent;
const EmailText = Text as unknown as EmailComponent;

const OTPEmail = (props: { otpCode: string }) => {
	return (
		<EmailHtml lang="en" dir="ltr">
			<EmailTailwind>
				<EmailHead />
				<EmailBody className="bg-white font-sans">
					<EmailContainer className="bg-white max-w-[600px] mx-auto px-[40px] py-[40px]">
						<EmailHeading className="text-gray-900 text-[24px] font-bold mb-[24px]">
							Verification code
						</EmailHeading>

						<EmailText className="text-gray-800 text-[16px] leading-[24px] mb-[24px]">
							Enter the following verification code when prompted:
						</EmailText>

						<EmailText className="text-[32px] font-bold text-gray-900 font-mono mb-[24px]">
							{props.otpCode}
						</EmailText>

						<EmailText className="text-gray-800 text-[16px] leading-[24px] mb-[40px]">
							To protect your account, do not share this code.
						</EmailText>

						<EmailSection className="border-t border-gray-200 pt-[24px]">
							<EmailText className="text-gray-500 text-[12px] leading-[16px] m-0">
								Autumn
								<br />
								2261 Market Street STE 22390
								<br />
								San Francisco, CA, US, 94114
							</EmailText>
						</EmailSection>
					</EmailContainer>
				</EmailBody>
			</EmailTailwind>
		</EmailHtml>
	);
};

OTPEmail.PreviewProps = {
	otpCode: "884085",
};

export default OTPEmail;
