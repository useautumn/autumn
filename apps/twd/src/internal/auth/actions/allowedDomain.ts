export const ALLOWED_DOMAIN = "useautumn.com";

export const isAllowedEmail = ({ email }: { email: string }) =>
	email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
