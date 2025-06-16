import { Resend } from "resend";

export const createResendCli = () => {
  return new Resend(process.env.RESEND_API_KEY);
};

export interface ResendEmailProps {
  to: string;
  subject: string;
  body: string;
  from: string;
}

export const nameToEmail = (name: string) => {
  return `${name.toLowerCase().replace(/\s+/g, ".")}@${process.env.RESEND_DOMAIN}`;
};

export const sendTextEmail = async ({
  from,
  to,
  subject,
  body,
}: ResendEmailProps) => {
  const resend = createResendCli();
  await resend.emails.send({
    from: `${from} <${nameToEmail(from)}>`,
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
}: ResendEmailProps) => {
  const resend = createResendCli();
  await resend.emails.send({
    from: `${from} <${nameToEmail(from)}>`,
    to: to,
    subject: subject,
    html: body,
  });
};
