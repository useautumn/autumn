export type AdminObjectListing = { key: string; etag: string };

export type AdminObject = { text: string; etag: string };

export type AdminBucketObjects = {
	list(params: { prefix: string }): Promise<AdminObjectListing[]>;
	read(params: { key: string }): Promise<AdminObject | null>;
	create(params: { key: string; body: string }): Promise<boolean>;
	replace(params: {
		key: string;
		body: string;
		etag: string;
	}): Promise<boolean>;
	remove(params: { key: string }): Promise<void>;
};

export type AdminS3Client = {
	send(
		command: unknown,
		options?: { abortSignal?: AbortSignal },
	): Promise<unknown>;
};
