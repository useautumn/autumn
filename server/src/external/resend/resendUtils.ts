import { Resend } from "resend";
import { logger } from "../logtail/logtailUtils.js";

export const createResendCli = () => {
  return new Resend(process.env.RESEND_API_KEY);
};

export interface ResendEmailProps {
  to: string;
  subject: string;
  body: string;
  from: string;
  fromEmail?: string;
}

export const nameToEmail = (name: string) => {
  return `${name.toLowerCase().replace(/\s+/g, ".")}@hey.${process.env.RESEND_DOMAIN}`;
};

export const sendTextEmail = async ({
  from,
  fromEmail,
  to,
  subject,
  body,
}: ResendEmailProps) => {
  const resend = createResendCli();
  fromEmail = fromEmail
    ? `${fromEmail}@${process.env.RESEND_DOMAIN}`
    : nameToEmail(from);

  try {
    logger.info(`Sending email to ${to} with subject ${subject}`);
    const { data, error } = await resend.emails.send({
      from: `${from} <${fromEmail}>`,
      to: to,
      subject: subject,
      text: body,
    });

    if (error) {
      logger.error(`Error sending email`, {
        error,
        data: {
          from,
          fromEmail,
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
        fromEmail,
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
  fromEmail,
}: ResendEmailProps) => {
  const resend = createResendCli();

  fromEmail = fromEmail
    ? `${fromEmail}@${process.env.RESEND_DOMAIN}`
    : nameToEmail(from);

  await resend.emails.send({
    from: `${from} <${fromEmail}>`,
    to: to,
    subject: subject,
    html: body,
  });
};
