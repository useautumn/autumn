import { GetTableCommand, GlueClient } from "@aws-sdk/client-glue";

const GLUE_REGION = process.env.LAKE_GLUE_REGION ?? "us-east-2";
const GLUE_DATABASE = "internal";

const metadataLocationPattern = (table: string) =>
	new RegExp(
		`^s3://autumn-lake-prod-us-east-2/internal/${table}/[A-Za-z0-9/_.-]+\\.metadata\\.json$`,
	);

const glueClient = new GlueClient({ region: GLUE_REGION });

export const getLakeMetadataLocation = async ({
	table,
}: {
	table: string;
}): Promise<string> => {
	const response = await glueClient.send(
		new GetTableCommand({ DatabaseName: GLUE_DATABASE, Name: table }),
	);
	const location = response.Table?.Parameters?.metadata_location;
	if (!location || !metadataLocationPattern(table).test(location)) {
		throw new Error(
			`[ducklake] unexpected metadata_location from Glue for ${table}: ${location}`,
		);
	}
	return location;
};
