import crypto from "crypto";

export const verifySvixSignature = async (req: any, res: any) => {
	const SIGNING_SECRET = process.env.CLERK_SIGNING_SECRET;

	if (!SIGNING_SECRET) {
		throw new Error(
			"Error: Please add SIGNING_SECRET from Clerk Dashboard to .env",
		);
	}

	const headers = req.headers;
	const svix_id = headers["svix-id"];
	const svix_timestamp = headers["svix-timestamp"];
	const svix_signature = headers["svix-signature"];

	// Verify all headers are presen3t
	if (!svix_id || !svix_timestamp || !svix_signature) {
		throw new Error("Error: Missing svix headers");
	}

	// Verify timestamp is within tolerance (5 minutes)
	const timestamp = parseInt(svix_timestamp);
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestamp) > 300) {
		throw new Error("Error: Message timestamp too old");
	}

	const body = JSON.stringify(req.body);
	const signedContent = `${svix_id}.${svix_timestamp}.${body}`;

	// Need to base64 decode the secret
	const secretBytes = Buffer.from(SIGNING_SECRET.split("_")[1], "base64");
	const signature = crypto
		.createHmac("sha256", secretBytes)
		.update(signedContent)
		.digest("base64");

	// Get the actual signature from the header (removing the v1, prefix)
	const svixSignature = svix_signature.split(" ")[0].split(",")[1];

	try {
		// Use constant-time comparison to prevent timing attacks
		return crypto.timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(svixSignature),
		);
	} catch (err) {
		return false;
	}
};
