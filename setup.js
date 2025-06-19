#!/usr/bin/env node
import { randomBytes } from 'crypto';
import { writeFileSync, copyFileSync } from 'fs';
import inquirer from 'inquirer';
import { spawnSync } from 'child_process';
import chalk from 'chalk';

const genUrlSafeBase64 = (bytes) => {
  return randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}


const genRandomSubdomain = (length = 10) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const genAlphanumericPassword = (length = 24) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper to get or create a Supabase org
const getOrCreateSupabaseOrg = async () => {
  
  // List orgs (table output)
  const orgListResult = spawnSync(
    'npx',
    ['supabase', 'orgs', 'list'],
    { encoding: 'utf-8' }
  );
  if (orgListResult.status !== 0) {
    console.error(chalk.red('❌ Failed to list Supabase orgs.'));
    process.exit(1);
  }
  const lines = orgListResult.stdout.split('\n').map(l => l.trim()).filter(Boolean);

  // Find separator line (e.g., "------|------")
  const sepIdx = lines.findIndex(line => line.includes('|') && line.includes('-'));

  // If only header and separator, no orgs exist
  if (lines.length <= sepIdx + 1) {
    console.log(chalk.yellowBright('No Supabase organizations found.'));
    const { createOrg } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createOrg',
        message: chalk.cyan('Would you like to create a new Supabase organization now?'),
        default: true,
      },
    ]);
    if (!createOrg) {
      console.log(chalk.red('❌ Cannot continue without a Supabase organization. Exiting.'));
      process.exit(1);
    }
    const { orgName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'orgName',
        message: chalk.cyan('Enter a name for your new Supabase organization:'),
        validate: (input) => input && input.length > 2,
      },
    ]);
    console.log(chalk.blueBright(`\nCreating Supabase organization '${orgName}'...`));
    const createOrgResult = spawnSync(
      'npx',
      ['supabase', 'orgs', 'create', orgName],
      { stdio: 'inherit', encoding: 'utf-8' }
    );
    if (createOrgResult.status !== 0) {
      console.error(chalk.red('❌ Failed to create Supabase organization.'));
      process.exit(1);
    }
    // Done! Org created, return
    return;
  }

  // At least one org exists, just proceed
  return;
};

const generateSupabaseDatabaseUrl = async () => {
  // Step 3: Run supabase login
  console.log(chalk.magentaBright('\n================ Supabase Setup ================\n'));

  console.log(chalk.blueBright('\nLaunching Supabase login...'));
  spawnSync('npx', ['supabase', 'login'], { stdio: 'inherit' });

  // Step 3.5: Ensure org exists and select one
  await getOrCreateSupabaseOrg();

  // Step 4: Prompt for project name and region
  const projectName = "autumn-oss-db";

  // Step 5: Generate DB password (alphanumeric only)
  const dbPassword = genAlphanumericPassword(24); // 24 chars, alphanumeric

  // Step 6: Create Supabase project
  console.log(chalk.blueBright(`\nCreating Supabase project '${projectName}'...`));
  const createResult = spawnSync(
    'npx',
    ['supabase', 'projects', 'create', projectName, '--db-password', dbPassword],
    { stdio: 'inherit', encoding: 'utf-8' }
  );
  
  if (createResult.status !== 0) {
    console.error('❌ Failed to create Supabase project.');
    process.exit(1);
  }

  // List supabase projects
  const listResult = spawnSync(
    'npx',
    ['supabase', 'projects', 'list', '--output', 'json'],
    { encoding: 'utf-8' }
  );

  if (listResult.status !== 0) {
    console.error('❌ Failed to list Supabase projects.');
    process.exit(1);
  }

  const projects = JSON.parse(listResult.stdout);
  const found = projects.find(p => p.name === projectName);
  if (!found) {
    console.error(chalk.red('❌ Failed to find new Supabase project.'));
    process.exit(1);
  }
  const projectId = found.id;
  const region = found.region;  

  // Step 8: Construct DATABASE_URL
  const databaseUrl = `postgresql://postgres.${projectId}:${dbPassword}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
  console.log(chalk.greenBright(`\nGenerated DB password: ${dbPassword}\n`));
  console.log(chalk.greenBright(`\nYour DATABASE_URL is:\n${databaseUrl}\n`));
  console.log(chalk.yellow('--------------------------------'));

  // Step 9: Prompt to run docker compose up
  console.log(chalk.magentaBright('\nNext steps:'));
  console.log(chalk.yellow('Run "docker compose -f docker-compose.dev.yml up" to start Autumn'));
  

  return databaseUrl;
}

const handleDatabaseSetup = async () => {
 // Step 2: Ask user what to do for DB
 console.log(chalk.magentaBright('\n================ Autumn Database Setup ================\n'));
 const { dbOption } = await inquirer.prompt([
  {
    type: 'list',
    name: 'dbOption',
    message: chalk.cyan('How do you want to set up your database?'),
    choices: [
      { name: 'Set up Supabase (Cloud) for Autumn', value: 'supabase' },
      { name: 'Paste in your own DATABASE_URL', value: 'paste' },
      { name: 'Paste in your own DATABASE_URL later', value: 'later' },
    ],
    default: 'supabase',
  },
]);

let databaseUrl = '';

if (dbOption === 'supabase') {
  databaseUrl = await generateSupabaseDatabaseUrl();
} else if (dbOption === 'paste') {
  const res = await inquirer.prompt([
    {
      type: 'input',
      name: 'databaseUrl',
      message: 'Paste in your DATABASE_URL:',
      validate: (input) => input && input.length > 5,
    },
  ]);
  databaseUrl = res.databaseUrl;
} else if (dbOption === 'later') {
  databaseUrl = '';
} 

return databaseUrl;
}

const handleLocalRunSetup = async () => {
  // Step 10: Stripe webhook URL setup
  console.log(chalk.magentaBright('\n================ Stripe Webhook Setup ================\n'));
  const { webhookOption } = await inquirer.prompt([
    {
      type: 'list',
      name: 'webhookOption',
      message:
        chalk.cyan('Stripe requires a public URL to send webhook events to your app.\nThis is read from the STRIPE_WEBHOOK_URL environment variable.\n\nWould you like to:'), 
      choices: [
        { name: '1. Generate a localtunnel URL (recommended for local development)', value: 'localtunnel' },
        { name: '2. Skip for now and paste in your own URL later', value: 'skip' },
      ],
      default: 'localtunnel',
    },
  ]);

  let stripeWebhookVars = [];

  if (webhookOption === 'localtunnel') {
    const subdomain = genRandomSubdomain(32);
    const webhookUrl = `https://${subdomain}.loca.lt`;
    stripeWebhookVars.push(`STRIPE_WEBHOOK_URL=${webhookUrl}`);
    stripeWebhookVars.push(`LOCALHOST_RUN_SUBDOMAIN=${subdomain}`);
    console.log(chalk.greenBright(`\nTo start your webhook tunnel, run this in another terminal:\n`));
    console.log(chalk.yellowBright(`  npx localtunnel --port 8080 --subdomain ${subdomain}\n`));
    console.log(chalk.greenBright(`\nTest your webhook URL with:\n`));
    console.log(chalk.yellowBright(`  curl ${webhookUrl}\n`));
    console.log(chalk.cyan('If you need to restart the tunnel in the future, use the same command.'));
  } else if (webhookOption === 'paste') {
    const { stripeWebhookUrl } = await inquirer.prompt([
      {
        type: 'input',
        name: 'stripeWebhookUrl',
        message: chalk.cyan('Paste in your STRIPE_WEBHOOK_URL:'),
        validate: (input) => input && input.length > 5,
      },
    ]);
    stripeWebhookVars.push(`STRIPE_WEBHOOK_URL=${stripeWebhookUrl}`);
  } else {
    // skip
  }

  console.log(chalk.yellow('--------------------------------'));

  return stripeWebhookVars;
}

async function main() {
  // Step 1: Generate secrets
  console.log(chalk.magentaBright('\n================ Autumn Setup ================\n'));
  const localtunnelReservedKey = genRandomSubdomain(32);
  const secrets = {
    BETTER_AUTH_SECRET: genUrlSafeBase64(64),
    ENCRYPTION_IV: genUrlSafeBase64(16),
    ENCRYPTION_PASSWORD: genUrlSafeBase64(64),
    BETTER_AUTH_URL: 'http://localhost:8080',
    CLIENT_URL: 'http://localhost:3000',
    LOCALTUNNEL_RESERVED_KEY: localtunnelReservedKey,
    STRIPE_WEBHOOK_URL: `https://${localtunnelReservedKey}.loca.lt`,
  };

  let databaseUrl = "";
  let stripeWebhookVars = [];

  databaseUrl = await handleDatabaseSetup();
  // stripeWebhookVars = await handleLocalRunSetup();

  // Step 11: Write to server/.env
  console.log(chalk.magentaBright('\n================ Writing .env ================\n'));
  const envSections = [];

  // Autumn Auth section
  envSections.push(
    '# Auth',
    `BETTER_AUTH_SECRET=${secrets.BETTER_AUTH_SECRET}`,
    `BETTER_AUTH_URL=${secrets.BETTER_AUTH_URL}`,
    `CLIENT_URL=${secrets.CLIENT_URL}`,
    ''
  );

  // Stripe required section
  envSections.push(
    '# Stripe',
    `LOCALTUNNEL_RESERVED_KEY=${secrets.LOCALTUNNEL_RESERVED_KEY}`,
    `ENCRYPTION_IV=${secrets.ENCRYPTION_IV}`,
    `ENCRYPTION_PASSWORD=${secrets.ENCRYPTION_PASSWORD}`,
    `STRIPE_WEBHOOK_URL=${secrets.STRIPE_WEBHOOK_URL}`,
    ''
  );

  // Database section
  if (databaseUrl) {
    envSections.push(
      '# Database',
      `DATABASE_URL=${databaseUrl}`,
      ''
    );
  }

  // Stripe Webhooks section
  if (stripeWebhookVars.length > 0) {
    envSections.push('# Stripe Webhooks');
    envSections.push(...stripeWebhookVars);
    envSections.push('');
  }

  const envVars = envSections.join('\n');

  
  writeFileSync('server/.env', envVars);
  try {
    copyFileSync('vite/.env.example', 'vite/.env');
  } catch (error) {
    console.log(chalk.red('❌ Failed to copy vite/.env.example to vite/.env'));
    console.log(chalk.red('❌ Please copy the file manually'));
  }

  console.log(chalk.greenBright('🎉 Setup complete! 🎉'));
  console.log(chalk.cyan('You can find your env variables in server/.env'));


  // Prompt to run pnpm run db:push at the end
  const { runDbPush } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'runDbPush',
      message: chalk.cyan('Would you like to run "pnpm run db:push" to set up your tables now?'),
      default: true,
    },
  ]);

  if (runDbPush) {
    console.log(chalk.blueBright('\nRunning "pnpm run db:push"...'));
    const dbPushResult = spawnSync('pnpm', ['run', 'db:push'], { stdio: 'inherit', encoding: 'utf-8' });
    if (dbPushResult.status !== 0) {
      console.error(chalk.red('❌ Failed to run "pnpm run db:push". Please check the error above.'));
      process.exit(1);
    }
    console.log(chalk.greenBright('✅ Successfully ran "pnpm run db:push".'));
  }

  console.log(chalk.cyan('\nNext steps:'));
  console.log(chalk.cyan('Run the following command to start Autumn:'));
  console.log(chalk.cyan('  docker compose -f docker-compose.dev.yml up'));
}

main(); 