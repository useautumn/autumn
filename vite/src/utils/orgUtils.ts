export const getOrgLogoUrl = (orgId: string) => {
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/autumn/logo/${orgId}`;
};
