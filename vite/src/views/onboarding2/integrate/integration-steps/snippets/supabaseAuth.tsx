export const supabaseAuthSnippet = ({
	backendLang,
	customerType,
}: {
	backendLang?: string;
	customerType: "user" | "org";
}) => {
	if (customerType === "user") {
		return `const supabase = await createClient(request);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) return null;

    return {
      customerId: "123",
      customerData: {
        name: data.user.user_metadata?.name,
        email: data.user.email,
      },
    };`;
	}

	return `const supabase = await createClient(request);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) return null;

    // Get the orgId from your DB
    const orgId = "users_org_id";

    return {
      customerId: orgId,
      customerData: { name: "", email: "" },
    };`;
};
