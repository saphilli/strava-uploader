import dotenv from 'dotenv';
import { EmailScheduler } from './services/scheduler';
import { EmailConfig } from './types/email';
import logger from './utils/logger';
import { EmailProvider } from './types/email';

dotenv.config();

export function createEmailConfig(): EmailConfig {
  const providerStr = process.env.EMAIL_PROVIDER;
  const validProviders = Object.values(EmailProvider);

  if (!providerStr || !validProviders.includes(providerStr as EmailProvider)) {
    throw new Error(`EMAIL_PROVIDER must be either "${EmailProvider.Gmail}" or "${EmailProvider.Outlook}"`);
  }
  const provider = providerStr as EmailProvider;

  const config: EmailConfig = {
    provider,
    email: process.env.EMAIL_ADDRESS || '',
    domain: process.env.TECHNOGYM_DOMAIN || 'mywellness.com'
  };

  if (provider === EmailProvider.Outlook) {
    config.auth = {
      clientId: process.env.OUTLOOK_CLIENT_ID || '',
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
      refreshToken: process.env.OUTLOOK_REFRESH_TOKEN || ''
    };
    
    if (!config.email || !config.auth.clientId || !config.auth.clientSecret || !config.auth.refreshToken) {
      throw new Error('Missing required Outlook configuration. Check your environment variables.');
    }
  }

  if (!config.email) {
    throw new Error('EMAIL_ADDRESS is required in environment variables.');
  }

  return config;
}

export async function main(): Promise<void> {
  try {
    logger.info('Starting Strava Uploader Email Monitor');
    
    const config = createEmailConfig();
    const intervalMinutes = parseInt(process.env.MONITOR_INTERVAL_MINUTES || '5', 10);
    
    const scheduler = new EmailScheduler(config, intervalMinutes);
    
    const mode = process.env.MODE || 'scheduled';
    
    switch (mode) {
      case 'scheduled':
        await scheduler.startScheduledMonitoring();
        break;
      case 'continuous':
        await scheduler.startContinuousMonitoring();
        break;
      case 'once':
        await scheduler.runOnce();
        process.exit(0);
      default:
        logger.error('Invalid mode. Use: scheduled, continuous, or once');
        process.exit(1);
    }
    
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      scheduler.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      scheduler.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start email monitor:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
