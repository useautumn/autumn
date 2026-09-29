import { expect, mock, spyOn, test } from "bun:test";

async function verifyEditor() {
	const { default: axios } = await import("axios");
	const { QueryClient, QueryClientProvider, QueryObserver } = await import(
		"@tanstack/react-query"
	);
	const { renderToStaticMarkup } = await import("react-dom/server");
	const { toast } = await import("sonner");
	const { BALANCE_SHADOW_QUERY_KEY, getBalanceShadowFormValues } = await import(
		"@/views/admin/components/balanceShadowConfig"
	);
	type Config =
		import("@/views/admin/components/balanceShadowConfig").BalanceShadowConfig;
	type Values =
		import("@/views/admin/components/balanceShadowConfig").BalanceShadowFormValues;
	const config: Config = {
		enabled: true,
		run: {
			runId: "initial",
			ownershipTopic: "shadow.ownership",
			expiresAt: Date.now() + 3_600_000,
			customers: [
				{
					orgId: "org",
					env: "sandbox",
					customerId: "external-id",
					featureId: "messages",
				},
			],
		},
	};
	const requests: { url: string | undefined; body: unknown }[] = [];
	let failSave = true;
	const client = axios.create({
		adapter: async (request) => {
			requests.push({ url: request.url, body: JSON.parse(request.data) });
			if (failSave) throw new Error("Save unavailable");
			return {
				data: { success: true },
				status: 200,
				statusText: "OK",
				headers: {},
				config: request,
			};
		},
	});
	mock.module("@/services/useAxiosInstance", () => ({
		useAxiosInstance: () => client,
	}));
	const formHooks = await import("@/hooks/form/form");
	const originalUseAppForm = formHooks.useAppForm;
	type CapturedForm = {
		mount: () => () => void;
		setFieldValue: (name: "runId", value: string) => void;
		handleSubmit: () => Promise<void>;
		store: { state: { values: Values } };
	};
	let capturedForm: CapturedForm | undefined;
	spyOn(formHooks, "useAppForm").mockImplementation((options) => {
		const form = originalUseAppForm(options);
		capturedForm = form as unknown as CapturedForm;
		return form;
	});
	spyOn(toast, "success").mockImplementation(() => "toast");
	const { BalanceShadowConfigForm } = await import(
		"@/views/admin/components/BalanceShadowConfigForm"
	);
	const { BalanceShadowCustomerRow } = await import(
		"@/views/admin/components/BalanceShadowCustomerRow"
	);
	const { EdgeConfigDialogBody } = await import(
		"@/views/admin/components/EdgeConfigDialogBody"
	);
	const { edgeConfigStatusQueryKey } = await import(
		"@/views/admin/components/EdgeConfigCard"
	);
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const statusKey = edgeConfigStatusQueryKey({ configId: "balance-shadow" });
	queryClient.setQueryData(BALANCE_SHADOW_QUERY_KEY, config);
	queryClient.setQueryData(statusKey, config);
	const onClose = mock(() => {});
	const html = renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<BalanceShadowConfigForm config={config} onClose={onClose} />
		</QueryClientProvider>,
	);
	expect(html).toContain("Enable shadow copies");
	expect(html).toContain("Initialize these customers");
	expect(html).toContain("External customer ID");
	expect(html).toContain('type="submit"');
	expect(requests).toHaveLength(0);
	const form = capturedForm;
	if (!form) throw new Error("Form was not rendered");
	const unmount = form.mount();
	try {
		const waitForSave = () =>
			new Promise<void>((resolve) => {
				const unsubscribe = queryClient
					.getMutationCache()
					.subscribe((event) => {
						if (
							event.type === "updated" &&
							(event.action.type === "error" || event.action.type === "success")
						) {
							unsubscribe();
							resolve();
						}
					});
			});
		form.setFieldValue("runId", "edited-run");
		const failedSave = waitForSave();
		await form.handleSubmit();
		await failedSave;
		expect(form.store.state.values.runId).toBe("edited-run");
		expect(onClose).not.toHaveBeenCalled();
		expect(
			queryClient.getQueryState(BALANCE_SHADOW_QUERY_KEY)?.isInvalidated,
		).toBe(false);
		expect(queryClient.getQueryState(statusKey)?.isInvalidated).toBe(false);
		failSave = false;
		const successfulSave = waitForSave();
		await form.handleSubmit();
		await successfulSave;
		expect(requests).toEqual(
			Array.from({ length: 2 }, () => ({
				url: "/admin/balance-shadow-config",
				body: { enabled: true, run: { ...config.run, runId: "edited-run" } },
			})),
		);
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(
			queryClient.getQueryState(BALANCE_SHADOW_QUERY_KEY)?.isInvalidated,
		).toBe(true);
		expect(queryClient.getQueryState(statusKey)?.isInvalidated).toBe(true);

		const rowHtml = renderToStaticMarkup(
			<BalanceShadowCustomerRow
				customer={getBalanceShadowFormValues({ config }).customers[0]}
				index={0}
				onChange={() => {}}
				onRemove={() => {}}
			/>,
		);
		for (const label of rowHtml.matchAll(/<label[^>]*for="([^"]+)"/g)) {
			expect(rowHtml).toContain(`id="${label[1]}"`);
		}
		expect([...rowHtml.matchAll(/<label /g)]).toHaveLength(4);
		expect(rowHtml).toContain('aria-label="Remove entry 1"');

		const observer = new QueryObserver<Config>(queryClient, {
			queryKey: BALANCE_SHADOW_QUERY_KEY,
			queryFn: async () => {
				throw new Error("Read unavailable");
			},
			enabled: false,
		});
		await observer.refetch();
		const failedLoad = observer.getCurrentResult();
		expect(failedLoad.isError).toBe(true);
		expect(failedLoad.data).toEqual(config);
		const errorHtml = renderToStaticMarkup(
			<EdgeConfigDialogBody
				query={failedLoad}
				errorMessage="Failed to load shadow config"
			>
				{() => <button type="button">Save stale config</button>}
			</EdgeConfigDialogBody>,
		);
		expect(errorHtml).toContain("Failed to load shadow config");
		expect(errorHtml).toContain("Retry");
		expect(errorHtml).not.toContain("Save stale config");
		observer.destroy();
	} finally {
		unmount();
		queryClient.clear();
		mock.restore();
	}
}

test.concurrent(
	"shadow editor preserves failed saves, refreshes both queries, and blocks failed loads",
	async () => {
		if (process.env.BALANCE_SHADOW_EDITOR_TEST_CHILD === "1") {
			await verifyEditor();
			return;
		}
		// Keep hook mocks isolated from other UI tests in the Bun module registry.
		const child = Bun.spawn({
			cmd: [process.execPath, "test", import.meta.filename],
			cwd: new URL("../../../", import.meta.url).pathname,
			env: { ...process.env, BALANCE_SHADOW_EDITOR_TEST_CHILD: "1" },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		expect(exitCode, stdout + stderr).toBe(0);
	},
	10_000,
);
