import dotenv from 'dotenv';
import { EmailScheduler } from './services/scheduler';
import { EmailConfig } from './types/email';
import logger from './utils/logger';

dotenv.config();

function createEmailConfig(): EmailConfig {
  const provider = process.env.EMAIL_PROVIDER as 'gmail' | 'outlook';
  
  if (!provider || !['gmail', 'outlook'].includes(provider)) {
    throw new Error('EMAIL_PROVIDER must be either "gmail" or "outlook"');
  }

  const config: EmailConfig = {
    provider,
    email: process.env.EMAIL_ADDRESS || '',
    domain: process.env.TECHNOGYM_DOMAIN || 'mywellness.com'
  };

  if (provider === 'outlook') {
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

async function main(): Promise<void> {
  try {
    logger.info('Starting Strava Uploader Email Monitor');
    
    const config = createEmailConfig();
    const intervalMinutes = parseInt(process.env.MONITOR_INTERVAL_MINUTES || '5', 10);
    
    const scheduler = new EmailScheduler(config, intervalMinutes);
    
    const mode = process.argv[2] || 'scheduled';
    
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
        break;
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