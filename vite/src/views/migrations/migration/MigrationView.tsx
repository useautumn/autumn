import { useParams } from "react-router";
import V2Breadcrumb from "@/components/v2/breadcrumb";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { MigrationEditor } from "./MigrationEditor";

export function MigrationView() {
	const { migration_id } = useParams<{ migration_id: string }>();
	const { migrations, isLoading } = useMigrationsQuery();

	const migration = migrations.find((m) => m.id === migration_id);

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
				<V2Breadcrumb
					items={[
						{ name: "Migrations", href: "/migrations" },
						{ name: migration.id },
					]}
					className="pt-0 pl-0"
				/>
				<MigrationEditor migration={migration} />
			</div>
		</div>
	);
}
