import {
  SecretsManagerClient,
  PutSecretValueCommand,
  GetSecretValueCommand,
  CreateSecretCommand,
} from "@aws-sdk/client-secrets-manager";

export async function createSecret(secretId: string, secretString: string) {
  const client = new SecretsManagerClient();

  try {
    const res = await client.send(
      new CreateSecretCommand({
        Name: secretId,
        SecretString: secretString,
      })
    );
    return res.ARN;
  } catch (error) {
    console.error("Error creating secret:", error);
    return null;
  }
}

export async function updateSecret(secretId: string, secretString: string) {
  const client = new SecretsManagerClient();

  try {
    const res = await client.send(
      new PutSecretValueCommand({
        SecretId: secretId,
        SecretString: secretString,
      })
    );
    return res.ARN;
  } catch (error) {
    console.error("Error updating secret:", error);
    return null;
  }
}

export async function getSecret(secretId: string) {
  const client = new SecretsManagerClient();

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );

  return response.SecretString;
}
