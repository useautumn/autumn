#!/usr/bin/env node
import { randomBytes } from 'crypto';
import { writeFileSync, copyFileSync } from 'fs';
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

const handleLocalRunSetup = async () => {
  // Step 10: Stripe webhook URL setup
    console.log(chalk.magentaBright('\n================ Stripe Webhook Setup ================\n'));
    const subdomain = genRandomSubdomain(32);
    const webhookUrl = `https://${subdomain}.loca.lt`;
    stripeWebhookVars.push(`STRIPE_WEBHOOK_URL=${webhookUrl}`);
    stripeWebhookVars.push(`LOCALHOST_RUN_SUBDOMAIN=${subdomain}`);
    console.log(chalk.greenBright(`\nTo start your webhook tunnel, run this in another terminal:\n`));
    console.log(chalk.yellowBright(`  npx localtunnel --port 8080 --subdomain ${subdomain}\n`));
    console.log(chalk.greenBright(`\nTest your webhook URL with:\n`));
    console.log(chalk.yellowBright(`  curl ${webhookUrl}\n`));
    console.log(chalk.cyan('If you need to restart the tunnel in the future, use the same command.'));

    console.log(chalk.yellow('--------------------------------'));

    return stripeWebhookVars;
}

async function main() {
  // Step 1: Generate secrets
  console.log(chalk.magentaBright('\n================ Autumn Setup ================\n'));
  const localtunnelReservedKey = "askjdnaslkjdalkjen";
  const secrets = {
    BETTER_AUTH_SECRET: genUrlSafeBase64(64),
    BETTER_AUTH_URL: 'http://localhost:8080',
    CLIENT_URL: 'http://localhost:3000',
    STRIPE_WEBHOOK_URL: `https://${localtunnelReservedKey}.loca.lt`,
  };

  let databaseUrl = "";
  let stripeWebhookVars = [];

//   databaseUrl = await handleDatabaseSetup();
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
    `STRIPE_WEBHOOK_URL=${secrets.STRIPE_WEBHOOK_URL}`,
    ''
  );

  envSections.push(
    '# Database',
    ''
  );

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

  console.log(chalk.cyan('\nNext steps:'));
  console.log(chalk.cyan('Run the following command to start Autumn:'));
  console.log(chalk.cyan('  docker compose -f docker-compose.dev.yml up'));
}

main();