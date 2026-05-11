import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback } from "react";
import { useParams } from "react-router";
import V2Breadcrumb from "@/components/v2/breadcrumb";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { MigrationEditor } from "./MigrationEditor";
import { MigrationRunsView } from "./runs/MigrationRunsView";

const VIEW_MODES = ["editor", "runs"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

export function MigrationView() {
	const { migration_id } = useParams<{ migration_id: string }>();
	const { migrations, isLoading } = useMigrationsQuery();
	const [viewMode, setViewMode] = useQueryState(
		"tab",
		parseAsStringLiteral(VIEW_MODES).withDefault("editor"),
	);

	const migration = migrations.find((m) => m.id === migration_id);

	const handleSwitchToRuns = useCallback(
		() => setViewMode("runs"),
		[setViewMode],
	);

	if (isLoading) return <LoadingScreen />;

	if (!migration) {
		return (
			<ErrorScreen>
				<div className="text-t2 text-sm">Migration not found</div>
			</ErrorScreen>
		);
	}

	return (
		<div className="flex flex-col h-fit relative w-full pb-8 max-w-5xl mx-auto pt-4 sm:pt-8">
			<div className="px-4 sm:px-10 flex flex-col gap-6">
				<div className="flex items-center justify-between">
					<V2Breadcrumb
						items={[
							{ name: "Migrations", href: "/migrations" },
							{ name: migration.id },
						]}
						className="pt-0 pl-0"
					/>
					<GroupedTabButton
						value={viewMode}
						onValueChange={(v) => setViewMode(v as ViewMode)}
						options={VIEW_MODES.map((v) => ({
							value: v,
							label: v === "editor" ? "Editor" : "Runs",
						}))}
					/>
				</div>
				{viewMode === "editor" ? (
					<MigrationEditor
						migration={migration}
						onSwitchToRuns={handleSwitchToRuns}
					/>
				) : (
					<MigrationRunsView migrationId={migration.id} />
				)}
			</div>
		</div>
	);
}
