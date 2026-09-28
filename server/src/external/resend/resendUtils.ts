import { Resend } from "resend";
import { logger } from "../logtail/logtailUtils.js";

interface ResendEmailProps {
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
		const { error } = await resend.emails.send({
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

/** Removes a contact from every Resend audience so no broadcast reaches them. */
export const deleteResendContacts = async ({ email }: { email: string }) => {
	if (!process.env.RESEND_API_KEY) return;

	const resend = createResendCli();

	try {
		const { data, error } = await resend.audiences.list();
		if (error || !data) {
			logger.error("Failed to list resend audiences", { error, email });
			return;
		}

		for (const audience of data.data) {
			const { error: removeError } = await resend.contacts.remove({
				audienceId: audience.id,
				email,
			});

			if (removeError && removeError.name !== "not_found") {
				logger.warn("Failed to remove resend contact", {
					error: removeError,
					audienceId: audience.id,
					email,
				});
			}
		}
	} catch (error) {
		logger.error("Failed to delete resend contacts", { error, email });
	}
};
