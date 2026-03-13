import { readFileSync } from "node:fs";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { pull } from "../../commands/pull/pull.js";
import type { Feature, Plan } from "../../compose/models/index.js";
import { formatError } from "../api/client.js";
import { AppEnv } from "../env/index.js";
import type { UpdateResult } from "../transforms/inPlaceUpdate/index.js";
import { useOrganization } from "./useOrganization.js";

export interface GeneratedFile {
	name: string;
	path: string;
	lines: number;
}

interface PullParams {
	cwd: string;
	generateSdkTypes?: boolean;
	environment?: AppEnv;
	forceOverwrite?: boolean;
	noDeclarationFile?: boolean;
}

interface PullData {
	features: Feature[];
	plans: Plan[];
	files: GeneratedFile[];
	inPlace?: boolean;
	updateResult?: UpdateResult;
}

function countLines(filePath: string): number {
	try {
		const content = readFileSync(filePath, "utf-8");
		return content.split("\n").length;
	} catch {
		return 0;
	}
}

export function usePull(options?: {
	cwd?: string;
	environment?: AppEnv;
	onComplete?: () => void;
	forceOverwrite?: boolean;
	noDeclarationFile?: boolean;
}) {
	const effectiveCwd = options?.cwd ?? process.cwd();
	const environment = options?.environment ?? AppEnv.Sandbox;
	const onComplete = options?.onComplete;
	const forceOverwrite = options?.forceOverwrite ?? false;
	const noDeclarationFile = options?.noDeclarationFile ?? false;

	// Get org info using TanStack Query (this IS a query)
	const orgQuery = useOrganization(effectiveCwd, environment);

	// Use mutation for the pull operation
	const pullMutation = useMutation({
		mutationFn: async (params: PullParams): Promise<PullData> => {
			const result = await pull({
				generateSdkTypes: params.generateSdkTypes ?? true,
				cwd: params.cwd,
				environment: params.environment ?? AppEnv.Sandbox,
				forceOverwrite: params.forceOverwrite,
				noDeclarationFile: params.noDeclarationFile,
			});

			const files: GeneratedFile[] = [];

			if (result.configPath) {
				files.push({
					name: "autumn.config.ts",
					path: result.configPath,
					lines: countLines(result.configPath),
				});
			}

			if (result.sdkTypesPath) {
				files.push({
					name: "@useautumn-sdk.d.ts",
					path: result.sdkTypesPath,
					lines: countLines(result.sdkTypesPath),
				});
			}

			return {
				features: result.features,
				plans: result.plans,
				files,
				inPlace: result.inPlace,
				updateResult: result.updateResult,
			};
		},
		onSuccess: () => {
			// Call onComplete callback after successful pull
			if (onComplete) {
				// Add a small delay to let the UI show the success state
				setTimeout(() => {
					onComplete();
				}, 1000);
			}
		},
	});

	// Auto-trigger pull when org info is ready
	useEffect(() => {
		if (
			orgQuery.isSuccess &&
			!pullMutation.isPending &&
			!pullMutation.isSuccess
		) {
			pullMutation.mutate({
				cwd: effectiveCwd,
				generateSdkTypes: true,
				environment,
				forceOverwrite,
				noDeclarationFile,
			});
		}
	}, [
		orgQuery.isSuccess,
		pullMutation,
		effectiveCwd,
		environment,
		forceOverwrite,
		noDeclarationFile,
	]);

	const error = orgQuery.error || pullMutation.error;

	return {
		orgInfo: orgQuery.data,
		features: pullMutation.data?.features ?? [],
		plans: pullMutation.data?.plans ?? [],
		files: pullMutation.data?.files ?? [],
		isOrgLoading: orgQuery.isLoading,
		isPullLoading: pullMutation.isPending,
		isSuccess: pullMutation.isSuccess,
		error: error ? formatError(error) : null,
		inPlace: pullMutation.data?.inPlace,
		updateResult: pullMutation.data?.updateResult,
	};
}
