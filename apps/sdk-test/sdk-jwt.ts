import { Autumn } from "autumn-js";

try {
	const adminAutumn = new Autumn({
		secretKey: process.env.AUTUMN_SECRET_KEY!,
		serverURL: "http://localhost:8080",
	});

	const cusId = "jwt-test_123";

	try {
		await adminAutumn.customers.delete({ customerId: cusId });
	} catch (_) {}
	const customer = await adminAutumn.customers.getOrCreate({
		customerId: cusId,
		name: "JWT Test",
		email: "jwt@test.com",
	});

	console.log(customer);

	const jwt = await adminAutumn.keys.mint({
		customerId: cusId,
		indefinite: true,
	});

	console.log(jwt);

	const cusAutumn = new Autumn({
		secretKey: jwt.accessToken,
		serverURL: "http://localhost:8080",
	});

	const cusFromJwtClient = await cusAutumn.customers.get({ customerId: cusId });

	console.log(cusFromJwtClient);

	try {
		const expectError = await cusAutumn.customers.get({
			customerId: "fake-cusotmer-id",
		});
		const attachRes = await cusAutumn.billing.attach({
			customerId: cusId,
			planId: "pro_plan",
		});
		console.log("Expect error:", expectError);
		console.log("Attach result:", attachRes);
	} catch (error) {
		console.log(error);
	} finally {
	}
} catch (error) {
	console.log("Unexpected error: ", error);
}
