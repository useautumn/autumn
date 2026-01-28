import { logger } from "@/external/logtail/logtailUtils.js";
import { createResendCli } from "@/external/resend/resendUtils.js";
import { FROM_AUTUMN } from "./constants.js";
import OTPEmail from "./OTPEmail.js";

const sendOTPEmail = async ({ email, otp }: { email: string; otp: string }) => {
	if (!process.env.RESEND_API_KEY || !process.env.RESEND_DOMAIN) {
		logger.warn(`RESEND NOT SET UP, SIGN IN OTP: ${otp}`);
		return;
	}

	try {
		logger.info(`Sending OTP email to ${email}`);
		const resend = createResendCli();
		const { error } = await resend.emails.send({
			from: FROM_AUTUMN,
			to: email,
			subject: "Your verification code for Autumn",
			react: OTPEmail({ otpCode: otp }),
		});
		if (error) throw error;
	} catch (error: any) {
		logger.error(`Error sending OTP email: ${error.message}`);
	}
};

export default sendOTPEmail;
