import { Resend } from "resend";

export const createCli = () => {
  return new Resend(process.env.RESEND_API_KEY);
};

export const sendTextEmail = async ({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}) => {
  const resend = createCli();
  await resend.emails.send({
    from: `Ayush <ayush@${process.env.RESEND_DOMAIN}>`,
    to: to,
    subject: subject,
    text: body,
  });
};

export const sendHtmlEmail = async ({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}) => {
  const resend = createCli();
  await resend.emails.send({
    from: `Ayush <ayush@${process.env.RESEND_DOMAIN}>`,
    to: to,
    subject: subject,
    html: body,
  });
};
