import type { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export type EdgeConfigLocation = { bucket: string; region: string };

export type EdgeConfigLogger = {
	warn: (message: string) => void;
	error: (message: string) => void;
};

export type EdgeConfigS3Client = {
	send: (command: GetObjectCommand | PutObjectCommand) => Promise<{
		Body?: { transformToString: (encoding?: string) => Promise<string> };
	}>;
};

export type EdgeConfigStatus = {
	configured: boolean;
	healthy: boolean;
	lastFetchAt?: string;
	lastSuccessAt?: string;
	error?: string;
};

export type EdgeConfigContext = {
	location: () => EdgeConfigLocation;
	s3Client?: EdgeConfigS3Client;
	logger?: EdgeConfigLogger;
};
