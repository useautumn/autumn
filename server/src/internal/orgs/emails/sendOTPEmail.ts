import { createResendCli } from "@/external/resend/resendUtils.js";
import OTPEmail from "@emails/OTPEmail.js";

const sendOTPEmail = async ({ email, otp }: { email: string; otp: string }) => {
  const resend = createResendCli();

  await resend.emails.send({
    from: `Autumn <hey@${process.env.RESEND_DOMAIN}>`,
    to: email,
    subject: "Your verification code for Autumn",
    react: OTPEmail({ otpCode: otp }),
  });
};

export default sendOTPEmail;
