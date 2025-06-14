import { SupabaseClient } from "@supabase/supabase-js";

export const uploadFile = async ({
  sb,
  path,
  file,
  contentType,
}: {
  sb: SupabaseClient;
  path: string;
  file: Buffer;
  contentType?: string;
}) => {
  const { data, error } = await sb.storage.from("autumn").upload(path, file, {
    upsert: true,
    contentType,
  });

  if (error) {
    throw error;
  }

  return data;
};

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
    .createSignedUploadUrl(path, {
      upsert: true,
    });

  if (error) {
    throw error;
  }

  return data;
};
