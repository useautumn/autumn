import chalk from 'chalk';
import { 
  BenchmarkRunner, 
  DryRunHelper, 
  createMockCustomer, 
  createMockEvent 
} from './benchmark-utils.js';

// Mock the heavy imports to avoid actual database connections
const mockPerformDeductionOnCusEnt = (params: any) => {
  // Simulate the complex calculation logic from updateBalanceTask.ts
  DryRunHelper.mockComplexCalculation(500); // CPU work
  
  const { cusEnt, toDeduct } = params;
  const currentBalance = cusEnt.balance || 1000;
  const newBalance = Math.max(0, currentBalance - toDeduct);
  
  return {
    newBalance,
    newEntities: cusEnt.entities || [],
    deducted: Math.min(toDeduct, currentBalance),
  };
};

const mockUpdateCustomerBalance = async (params: any) => {
  const { customerId, features, event } = params;
  
  // Simulate database fetch (based on updateBalanceTask.ts timing)
  DryRunHelper.mockDbOperation('getCustomer', { customerId });
  DryRunHelper.mockDbOperation('getCusEnts', { features });
  
  // Simulate the balance calculation logic
  const featureDeductions = features.map((feature: any) => ({
    feature,
    deduction: event.usage || 1,
  }));
  
  // Simulate the deduction process for each feature
  for (const { feature, deduction } of featureDeductions) {
    const cusEnt = { balance: 1000, entities: [] };
    mockPerformDeductionOnCusEnt({
      cusEnt,
      toDeduct: deduction,
      entityId: event.entity_id,
    });
  }
  
  return { success: true };
};

const mockInitCustomer = async (customerId: string) => {
  // Simulate customer initialization process
  DryRunHelper.mockDbOperation('createCustomer', createMockCustomer(customerId));
  DryRunHelper.mockStripeOperation('createStripeCustomer', { id: `cus_${customerId}` });
  
  // Simulate setting up default entitlements
  DryRunHelper.mockDbOperation('createEntitlements', {
    customerId,
    entitlements: ['free_tier'],
  });
  
  return { customerId, initialized: true };
};

const mockEntitlementCheck = async (customerId: string, featureId: string) => {
  // Simulate the entitled check logic
  DryRunHelper.mockDbOperation('getEntitlements', { customerId, featureId });
  
  // Simulate complex entitlement calculation
  DryRunHelper.mockComplexCalculation(100);
  
  return {
    allowed: true,
    balances: [{ feature_id: featureId, balance: 950, unlimited: false }],
  };
};

export const runCustomerBenchmarks = async () => {
  const runner = new BenchmarkRunner({
    iterations: 50,
    warmupIterations: 5,
  });

  console.log(chalk.cyan('🧑‍💼 Customer Operations Benchmark'));
  console.log(chalk.gray('Measuring core customer lifecycle operations\n'));
  
  // Core customer operations in realistic scenarios
  await runner.run('Customer Creation', async () => {
    const customerId = `cust_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    await mockInitCustomer(customerId);
  });

  await runner.run('Usage Tracking (Light)', async () => {
    const event = createMockEvent('customer_123', 'api_calls', 5);
    await mockUpdateCustomerBalance({
      customerId: 'customer_123',
      features: [{ id: 'api_calls', internal_id: 'api_internal' }],
      event,
      org: { slug: 'prod-org', config: { reverse_deduction_order: false } },
      env: 'production',
    });
  });

  await runner.run('Usage Tracking (Heavy)', async () => {
    const event = createMockEvent('customer_456', 'compute_hours', 100);
    await mockUpdateCustomerBalance({
      customerId: 'customer_456',
      features: [{ id: 'compute_hours', internal_id: 'compute_internal' }],
      event,
      org: { slug: 'prod-org', config: { reverse_deduction_order: false } },
      env: 'production',
    });
  });

  await runner.run('Multi-Feature Deduction', async () => {
    const event = createMockEvent('customer_789', 'api_calls', 25);
    await mockUpdateCustomerBalance({
      customerId: 'customer_789',
      features: [
        { id: 'api_calls', internal_id: 'api_internal' },
        { id: 'storage_gb', internal_id: 'storage_internal' },
        { id: 'bandwidth_gb', internal_id: 'bandwidth_internal' },
      ],
      event,
      org: { slug: 'prod-org', config: { reverse_deduction_order: false } },
      env: 'production',
    });
  });

  await runner.run('Entitlement Check', async () => {
    await mockEntitlementCheck('customer_premium', 'advanced_analytics');
  });

  await runner.run('Batch Processing (10 customers)', async () => {
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      const event = createMockEvent(`batch_cust_${i}`, 'api_calls', 2);
      promises.push(mockUpdateCustomerBalance({
        customerId: `batch_cust_${i}`,
        features: [{ id: 'api_calls', internal_id: 'api_internal' }],
        event,
        org: { slug: 'prod-org', config: { reverse_deduction_order: false } },
        env: 'production',
      }));
    }
    await Promise.all(promises);
  });

  runner.printSummary();
  return runner.getResults();
}; 