import { EmailConfig } from './types/email';
import fs from 'fs';
import path from 'path';

const technogym_domain = process.env.TECHNOGYM_DOMAIN || 'mywellness.com';

export function initializeEmailConfig(gmailSecretsKey : string): EmailConfig {
  try {
    // Try to read credentials from local file first (dev environment)
    const credentialsPath = path.join(process.cwd(), 'credentials.json');
    
    let credentials;
    if (fs.existsSync(credentialsPath)) {
      console.log('Reading Gmail configuration from credentials.json');
      const credentialsData = fs.readFileSync(credentialsPath, 'utf8');
      credentials = JSON.parse(credentialsData);
    } else {
      // Fallback to environment variables (In Production, secrets are mounted as env vars)
      console.log('Reading Gmail configuration from env variables');
      const credentialsJson = process.env[gmailSecretsKey] || '{}';
      credentials = JSON.parse(credentialsJson);
    }

    // Validate required fields
    if (!credentials.installed.client_id || !credentials.installed.client_secret || !credentials.installed.refresh_token) {
      throw new Error('Missing required Gmail credentials: client_id, client_secret, or refresh_token');
    }

    const config: EmailConfig = {
      domain: technogym_domain,
      auth: {
        clientId: credentials.installed.client_id,
        clientSecret: credentials.installed.client_secret,
        refreshToken: credentials.installed.refresh_token
      }
    };

    console.log('Gmail configuration initialized successfully');
    return config;

  } catch (error) {
    console.error('Failed to initialize Gmail configuration:', error);
    throw new Error('Could not initialize Gmail configuration.'+
      'Ensure credentials.json exists or Secret Manager is configured correctly.');
  }
}