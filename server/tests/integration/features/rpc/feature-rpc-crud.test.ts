import { expect, test } from "bun:test";
import { ApiFeatureV1Schema, ApiVersion, FeatureType } from "@autumn/shared";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const makeFeatureId = () =>
	`rpc_feature_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

test.concurrent(`${chalk.yellowBright("feature-rpc: crud + list")}`, async () => {
	const autumn = new AutumnInt({ version: ApiVersion.V2_1 });
	const featureId = makeFeatureId();
	const featureName = "Feature RPC CRUD";
	const updatedName = "Feature RPC CRUD Updated";

	const created = await autumn.post("/features.create", {
		id: featureId,
		name: featureName,
		type: FeatureType.Boolean,
	});
	ApiFeatureV1Schema.parse(created);
	expect(created.id).toBe(featureId);
	expect(created.name).toBe(featureName);

	const listed = await autumn.post("/features.list", {});
	expect(Array.isArray(listed.list)).toBe(true);
	const listedFeature = listed.list.find(
		(feature: { id: string }) => feature.id === featureId,
	);
	expect(listedFeature).toBeDefined();
	ApiFeatureV1Schema.parse(listedFeature);

	const got = await autumn.post("/features.get", {
		feature_id: featureId,
	});
	ApiFeatureV1Schema.parse(got);
	expect(got.id).toBe(featureId);

	const updated = await autumn.post("/features.update", {
		feature_id: featureId,
		name: updatedName,
	});
	ApiFeatureV1Schema.parse(updated);
	expect(updated.id).toBe(featureId);
	expect(updated.name).toBe(updatedName);

	const deleted = await autumn.post("/features.delete", {
		feature_id: featureId,
	});
	expect(deleted).toEqual({ success: true });
});
