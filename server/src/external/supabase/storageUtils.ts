import { SupabaseClient } from "@supabase/supabase-js";

export const getUploadUrl = async ({
  sb,
  path,
}: {
  sb: SupabaseClient;
  path: string;
}) => {
  await sb.storage.from("autumn").remove([path]);

  const { data, error } = await sb.storage
    .from("autumn")
    .createSignedUploadUrl(path);

  if (error) {
    throw error;
  }

  return data;
};
