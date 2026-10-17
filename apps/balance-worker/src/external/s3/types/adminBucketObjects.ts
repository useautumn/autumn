export type AdminObject = { text: string; etag: string };

export type AdminBucketObjects = {
	read(params: { key: string }): Promise<AdminObject | null>;
	create(params: { key: string; body: string }): Promise<boolean>;
	replace(params: {
		key: string;
		body: string;
		etag: string;
	}): Promise<boolean>;
};

export type AdminS3Client = {
	send(
		command: unknown,
		options?: { abortSignal?: AbortSignal },
	): Promise<unknown>;
};
