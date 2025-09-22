import { Resend } from "resend";
import { logger } from "../logtail/logtailUtils.js";

export interface ResendEmailProps {
	to: string;
	subject: string;
	body: string;
	from: string;
	fromEmail?: string;
	replyTo?: string;
}

export const createResendCli = () => {
	return new Resend(process.env.RESEND_API_KEY);
};

export const sendTextEmail = async ({
	from,
	to,
	subject,
	body,
}: ResendEmailProps) => {
	const resend = createResendCli();

	try {
		logger.info(`Sending email to ${to} with subject ${subject}`);
		const { data, error } = await resend.emails.send({
			from: from,
			to: to,
			subject: subject,
			text: body,
		});

		if (error) {
			logger.error(`Error sending email`, {
				error,
				data: {
					from,
					to,
					subject,
					body,
				},
			});
		}
	} catch (error) {
		logger.error(`Error sending email`, {
			error,
			data: {
				from,
				to,
				subject,
				body,
			},
		});
		throw error;
	}
};

export const sendHtmlEmail = async ({
	from,
	to,
	subject,
	body,
	replyTo,
}: ResendEmailProps) => {
	const resend = createResendCli();

	await resend.emails.send({
		from: from,
		to: to,
		subject: subject,
		html: body,
		replyTo,
	});
};
