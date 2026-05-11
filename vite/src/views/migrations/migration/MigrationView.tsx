import { useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { MigrationEditor } from "./MigrationEditor";

export function MigrationView() {
	const { migration_id } = useParams<{ migration_id: string }>();
	const { migrations, isLoading } = useMigrationsQuery();
	const env = useEnv();
	const navigate = useNavigate();

	const migration = migrations.find((m) => m.id === migration_id);

	const goToMigrations = useCallback(
		() => navigateTo("/migrations", navigate, env),
		[navigate, env],
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
				<Breadcrumb className="text-t3 flex">
					<BreadcrumbList className="text-t3 text-xs w-full">
						<BreadcrumbItem
							onClick={goToMigrations}
							className="cursor-pointer"
						>
							Migrations
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem className="text-t2">
							{migration.id}
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
				<MigrationEditor migration={migration} />
			</div>
		</div>
	);
}
