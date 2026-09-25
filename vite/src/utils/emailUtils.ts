const EMAIL_DOMAIN_PATTERN =
	/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const getEmailDomain = ({ email }: { email: string }) => {
	const atIndex = email.lastIndexOf("@");
	if (atIndex === -1) return null;
	const domain = email
		.slice(atIndex + 1)
		.trim()
		.toLowerCase();
	return EMAIL_DOMAIN_PATTERN.test(domain) ? domain : null;
};
