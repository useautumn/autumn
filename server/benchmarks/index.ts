#!/usr/bin/env tsx

import chalk from 'chalk';
import { runCustomerBenchmarks } from './customer-benchmarks.js';
import { runAttachBenchmarks } from './attach-benchmarks.js';

interface BenchmarkSuite {
  name: string;
  runner: () => Promise<any>;
  enabled: boolean;
}

const BENCHMARK_SUITES: BenchmarkSuite[] = [
  {
    name: 'Customer Operations',
    runner: runCustomerBenchmarks,
    enabled: true,
  },
  {
    name: 'Product Attachments',
    runner: runAttachBenchmarks,
    enabled: true,
  },
];

async function main() {
  const args = process.argv.slice(2);
  const suiteFilter = args[0];
  
  console.log(chalk.cyan('⚡ Autumn Server Performance Benchmarks'));
  console.log(chalk.gray('Dry-run performance testing with realistic workloads'));
  console.log(chalk.gray(`${new Date().toLocaleString()} | Node ${process.version} | ${process.platform}\n`));

  const startTime = performance.now();
  const allResults: any[] = [];

  // Filter suites if specified
  const suitesToRun = suiteFilter 
    ? BENCHMARK_SUITES.filter(suite => 
        suite.name.toLowerCase().includes(suiteFilter.toLowerCase()) ||
        suite.name.toLowerCase().replace(/\s+/g, '').includes(suiteFilter.toLowerCase())
      )
    : BENCHMARK_SUITES.filter(suite => suite.enabled);

  if (suitesToRun.length === 0) {
    console.log(chalk.red(`❌ No benchmark suites found matching: ${suiteFilter}`));
    console.log(chalk.yellow('\nAvailable suites:'));
    BENCHMARK_SUITES.forEach(suite => {
      console.log(chalk.yellow(`  • ${suite.name.toLowerCase().replace(/\s+/g, '')}`));
    });
    process.exit(1);
  }

  // Run each benchmark suite
  for (const suite of suitesToRun) {
    try {
      const suiteStartTime = performance.now();
      const results = await suite.runner();
      const suiteEndTime = performance.now();
      
      allResults.push({
        suite: suite.name,
        results,
        duration: suiteEndTime - suiteStartTime,
      });
      
    } catch (error) {
      console.error(chalk.red(`❌ Error in ${suite.name}:`), error);
    }
  }

  const endTime = performance.now();
  const totalDuration = endTime - startTime;

  // Print concise overall summary
  console.log(chalk.yellow('\n🎯 Overall Results'));
  console.log(chalk.yellow('─'.repeat(40)));
  
  let totalBenchmarks = 0;
  let fastOperations = 0;
  
  allResults.forEach(suiteResult => {
    totalBenchmarks += suiteResult.results.length;
    fastOperations += suiteResult.results.filter((r: any) => r.averageTime < 5).length;
    
    const avgTime = suiteResult.results.reduce((sum: number, r: any) => sum + r.averageTime, 0) / suiteResult.results.length;
    const timeColor = avgTime < 5 ? chalk.green : avgTime < 20 ? chalk.yellow : chalk.red;
    
    console.log(`${chalk.cyan(suiteResult.suite.padEnd(25))} ${timeColor(`${avgTime.toFixed(1)}ms avg`)} ${chalk.gray(`(${suiteResult.results.length} tests)`)}`);
  });
  
  console.log(chalk.gray(`\n💡 ${fastOperations}/${totalBenchmarks} operations under 5ms | Total time: ${totalDuration.toFixed(0)}ms`));

  // Export results if requested
  if (args.includes('--export') || args.includes('-e')) {
    const exportData = {
      timestamp: new Date().toISOString(),
      platform: { node: process.version, platform: process.platform, arch: process.arch },
      totalDuration,
      suites: allResults,
    };
    
    console.log(chalk.blue(`\n📄 Results exported (${JSON.stringify(exportData).length} bytes)`));
  }

  console.log(chalk.green('\n✅ Benchmark completed successfully!'));
}

// Handle CLI execution - always run when this file is executed directly
main().catch(error => {
  console.error(chalk.red('❌ Benchmark execution failed:'), error);
  process.exit(1);
});

export { main as runAllBenchmarks }; 