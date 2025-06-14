import { Resend } from "resend";

export const createCli = () => {
  return new Resend(process.env.RESEND_API_KEY);
};

export interface ResendEmailProps {
  to: string;
  subject: string;
  body: string;
  from: string
}

export const nameToEmail = (name: string) => {
  return `${name.toLowerCase().replace(/\s+/g, ".")}@${process.env.RESEND_DOMAIN}`;
};

export const sendTextEmail = async ({
  to,
  subject,
  body,
  from,
}: ResendEmailProps) => {
  const resend = createCli();
  await resend.emails.send({
    from: `${from} <${nameToEmail(from)}>`,
    to: to,
    subject: subject,
    text: body,
  });
};

export const sendHtmlEmail = async ({
  to,
  subject,
  body,
  from
}: ResendEmailProps) => {
  const resend = createCli();
  await resend.emails.send({
    from: `${from} <${nameToEmail(from)}>`,
    to: to,
    subject: subject,
    html: body,
  });
};
