import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const CONFIRM_REMOVE_TEXT = "remove";

const getToastErrorMessage = ({
	error,
	fallback,
}: {
	error: unknown;
	fallback: string;
}) => {
	if (!error || typeof error !== "object" || !("response" in error)) {
		return fallback;
	}

	const response = error.response as
		| { data?: { message?: string } }
		| undefined;
	return response?.data?.message ?? fallback;
};

export const ConfigureRedis = () => {
	const { org, mutate } = useOrg();
	const axiosInstance = useAxiosInstance();

	const [connectionString, setConnectionString] = useState("");
	const [saving, setSaving] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [updatingMigration, setUpdatingMigration] = useState(false);

	const [showConnectDialog, setShowConnectDialog] = useState(false);
	const [showRemoveDialog, setShowRemoveDialog] = useState(false);
	const [showMigrationDialog, setShowMigrationDialog] = useState(false);
	const [removeConfirmText, setRemoveConfirmText] = useState("");
	const [newMigrationPercent, setNewMigrationPercent] = useState("");

	const redisConfig = org?.redis_config;
	const isConfigured = !!redisConfig;

	useEffect(() => {
		if (!showRemoveDialog) setRemoveConfirmText("");
	}, [showRemoveDialog]);

	useEffect(() => {
		if (showMigrationDialog) {
			setNewMigrationPercent(String(redisConfig?.migrationPercent ?? 0));
		}
	}, [showMigrationDialog, redisConfig?.migrationPercent]);

	const handleConnect = async () => {
		if (!connectionString.trim()) return;

		setSaving(true);
		try {
			await axiosInstance.patch("/v1/organization/redis", {
				connectionString,
			});
			await mutate();
			setConnectionString("");
			setShowConnectDialog(false);
			toast.success("Redis connection created");
		} catch (error) {
			toast.error(
				getToastErrorMessage({
					error,
					fallback: "Failed to create Redis connection",
				}),
			);
		}
		setSaving(false);
	};

	const handleUpdateMigration = async () => {
		const percent = Number(newMigrationPercent);
		if (
			Number.isNaN(percent) ||
			!Number.isInteger(percent) ||
			percent < 0 ||
			percent > 100
		) {
			toast.error("Migration percent must be a whole number between 0 and 100");
			return;
		}

		setUpdatingMigration(true);
		try {
			await axiosInstance.patch("/v1/organization/redis/migration", {
				migrationPercent: percent,
			});
			await mutate();
			setShowMigrationDialog(false);
			toast.success(`Migration updated to ${percent}%`);
		} catch (error) {
			toast.error(
				getToastErrorMessage({
					error,
					fallback: "Failed to update migration",
				}),
			);
		}
		setUpdatingMigration(false);
	};

	const handleRemove = async () => {
		if (removeConfirmText !== CONFIRM_REMOVE_TEXT) return;

		setRemoving(true);
		try {
			await axiosInstance.delete("/v1/organization/redis");
			await mutate();
			setShowRemoveDialog(false);
			toast.success("Redis connection removed");
		} catch (error) {
			toast.error(
				getToastErrorMessage({
					error,
					fallback: "Failed to remove Redis connection",
				}),
			);
		}
		setRemoving(false);
	};

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Redis</CardTitle>
					<CardDescription>
						Connect a dedicated Redis instance for this org. Customer cache and
						balance operations route by migration percentage.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{isConfigured ? (
						<div className="flex flex-col gap-4">
							<div className="flex flex-col gap-1">
								<FormLabel>Connected Host</FormLabel>
								<Input
									value={redisConfig.host}
									readOnly
									className="font-mono text-xs"
								/>
							</div>
							{redisConfig.workerHost && (
								<div className="flex flex-col gap-1">
									<FormLabel>Worker Host</FormLabel>
									<Input
										value={redisConfig.workerHost}
										readOnly
										className="font-mono text-xs"
									/>
								</div>
							)}
							<div className="flex flex-col gap-1">
								<FormLabel>Migration Percentage</FormLabel>
								<div className="flex items-center gap-2">
									<Input
										value={`${redisConfig.migrationPercent}%`}
										readOnly
										className="w-24 font-mono text-xs"
									/>
									<span className="text-t3 text-xs">
										of customers on dedicated Redis
									</span>
								</div>
							</div>
							<div className="flex gap-2">
								<Button
									variant="secondary"
									onClick={() => setShowMigrationDialog(true)}
								>
									Update Migration %
								</Button>
								<Button
									variant="destructive"
									onClick={() => setShowRemoveDialog(true)}
									disabled={redisConfig.migrationPercent > 0}
								>
									Remove
								</Button>
							</div>
							{redisConfig.migrationPercent > 0 && (
								<p className="text-t3 text-xs">
									Set migration to 0% before removing the Redis connection.
								</p>
							)}
						</div>
					) : (
						<div className="flex flex-col gap-4">
							<div className="flex flex-col gap-1">
								<FormLabel>Connection String</FormLabel>
								<Input
									placeholder="rediss://default:password@host:6379"
									value={connectionString}
									onChange={(event) => setConnectionString(event.target.value)}
									className="font-mono text-xs"
								/>
							</div>
							<div>
								<Button
									onClick={() => setShowConnectDialog(true)}
									disabled={!connectionString.trim()}
								>
									Connect Redis
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Connect Redis</DialogTitle>
						<DialogDescription>
							Migration starts at 0%. No customers will be routed until the
							migration percentage is increased.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="secondary"
							onClick={() => setShowConnectDialog(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleConnect}
							isLoading={saving}
							disabled={!connectionString.trim()}
						>
							Connect
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={showMigrationDialog} onOpenChange={setShowMigrationDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Update Migration Percentage</DialogTitle>
						<DialogDescription>
							Customers are assigned deterministically by customer ID.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1">
						<FormLabel>
							Current: {redisConfig?.migrationPercent ?? 0}% / New:
						</FormLabel>
						<div className="flex items-center gap-2">
							<Input
								type="number"
								min={0}
								max={100}
								value={newMigrationPercent}
								onChange={(event) => setNewMigrationPercent(event.target.value)}
								className="w-24 font-mono text-xs"
							/>
							<span className="text-t3 text-sm">%</span>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="secondary"
							onClick={() => setShowMigrationDialog(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleUpdateMigration}
							isLoading={updatingMigration}
						>
							Update
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove Redis Connection</DialogTitle>
						<DialogDescription>
							This org will revert to the shared Redis instance. Type{" "}
							<span className="font-bold">"{CONFIRM_REMOVE_TEXT}"</span> to
							confirm.
						</DialogDescription>
					</DialogHeader>
					<Input
						placeholder={`Type "${CONFIRM_REMOVE_TEXT}" to confirm`}
						value={removeConfirmText}
						onChange={(event) => setRemoveConfirmText(event.target.value)}
						variant="destructive"
					/>
					<DialogFooter>
						<Button
							variant="secondary"
							onClick={() => setShowRemoveDialog(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleRemove}
							isLoading={removing}
							disabled={removeConfirmText !== CONFIRM_REMOVE_TEXT}
						>
							Remove
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
