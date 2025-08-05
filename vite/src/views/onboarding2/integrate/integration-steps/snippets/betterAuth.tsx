export const betterAuthSnippet = (
  customerType: "user" | "org",
  headersString: string,
  tabLevel: number = 0
) => {
  const tabs = "  ".repeat(tabLevel);

  let snippet = ``;
  if (customerType === "user") {
    snippet = `${tabs}const session = await auth.api.getSession({
${tabs}  headers: ${headersString},
${tabs}});
${tabs}
${tabs}return {
${tabs}  customerId: session?.user.id,
${tabs}  customerData: {
${tabs}    name: session?.user.name,
${tabs}    email: session?.user.email,
${tabs}  },
${tabs}};`;
  } else {
    snippet = `${tabs}const session = await auth.api.getSession({
${tabs}  headers: ${headersString},
${tabs}});
${tabs}
${tabs}return {
${tabs}  customerId: session?.session.activeOrganizationId,
${tabs}  customerData: { name: "", email: "" }
${tabs}};`;
  }

  return snippet;
};
