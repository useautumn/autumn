import { createSupabaseClient } from "../supabaseUtils.js";

export const readFile = async ({
	bucket = "autumn",
	path,
}: {
	bucket: string;
	path: string;
}) => {
	const sb = createSupabaseClient();
	const { data, error } = await sb.storage.from(bucket).download(path);

	if (error) {
		throw error;
	}
	return data;
};

export const uploadFile = async ({
	path,
	file,
	contentType,
}: {
	path: string;
	file: Buffer;
	contentType?: string;
}) => {
	const sb = createSupabaseClient();

	const { data, error } = await sb.storage.from("autumn").upload(path, file, {
		upsert: true,
		contentType,
	});

	if (error) {
		throw error;
	}

	return data;
};

export const getUploadUrl = async ({ path }: { path: string }) => {
	const sb = createSupabaseClient();
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
