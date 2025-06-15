import { logger } from "@/external/logtail/logtailUtils.js";
import { createResendCli } from "@/external/resend/resendUtils.js";
import OTPEmail from "@emails/OTPEmail.js";

const sendOTPEmail = async ({ email, otp }: { email: string; otp: string }) => {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_DOMAIN) {
    logger.warn(`RESEND NOT SET UP, SIGN IN OTP: ${otp}`);
    return;
  }

  const resend = createResendCli();
  await resend.emails.send({
    from: `Autumn <hey@${process.env.RESEND_DOMAIN}>`,
    to: email,
    subject: "Your verification code for Autumn",
    react: OTPEmail({ otpCode: otp }),
  });
};

export default sendOTPEmail;
