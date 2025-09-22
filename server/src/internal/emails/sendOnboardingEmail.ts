import { sendHtmlEmail } from "@/external/resend/resendUtils.js";
import { safeResend } from "@/external/resend/safeResend.js";
import { FROM_AYUSH } from "./constants.js";

const getWelcomeEmailBody = (userFirstName: string) => {
	return `
<p>Hey ${userFirstName} :)</p>

<p>Just wanted to say thank you for signing up to Autumn!</p>

<p>I'm curious--how did you hear about us? Also are you just looking around or do you have a specific use case I can help you with?</p>

<p>Whatever the reason, anything you need I'm here to help.</p>

<p>Ayush<br>
Co-founder, Autumn</p>

<p>Oh, and join our <a href="https://discord.gg/STqxY92zuS">Discord community</a> to connect with us and other users</p>
  `;
};

export const sendOnboardingEmail = safeResend({
	fn: async ({ name, email }: { name: string; email: string }) => {
		const firstName = name.split(" ")[0];

		await sendHtmlEmail({
			from: FROM_AYUSH,
			to: email,
			subject: "Anything I can help with?",
			body: getWelcomeEmailBody(firstName),
			replyTo: "ayush@useautumn.com",
		});
	},
	action: "send onboarding email",
});
