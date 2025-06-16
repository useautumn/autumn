import { Resend } from "resend";

export const createResendCli = () => {
  return new Resend(process.env.RESEND_API_KEY);
};

export const sendTextEmail = async ({
  from,
  to,
  subject,
  body,
}: {
  from?: string;
  to: string;
  subject: string;
  body: string;
}) => {
  const resend = createResendCli();
  await resend.emails.send({
    from: from || `Ayush <ayush@${process.env.RESEND_DOMAIN}>`,
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
}: {
  from?: string;
  to: string;
  subject: string;
  body: string;
}) => {
  const resend = createResendCli();
  await resend.emails.send({
    from: from || `Ayush <ayush@${process.env.RESEND_DOMAIN}>`,
    to: to,
    subject: subject,
    html: body,
  });
};
