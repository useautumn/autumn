import { Resend } from "resend";

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
  return `${name.toLowerCase().replace(/\s+/g, ".")}@${process.env.RESEND_DOMAIN}`;
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
    ? `${fromEmail}${process.env.RESEND_DOMAIN}`
    : nameToEmail(from);

  await resend.emails.send({
    from: `${from} <${fromEmail}>`,
    to: to,
    subject: subject,
    text: body,
  });
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
    ? `${fromEmail}${process.env.RESEND_DOMAIN}`
    : nameToEmail(from);

  await resend.emails.send({
    from: `${from} <${fromEmail}>`,
    to: to,
    subject: subject,
    html: body,
  });
};
