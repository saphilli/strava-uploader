import dotenv from 'dotenv';
import { EmailScheduler } from './strava-uploader/scheduler';
import { EmailConfig } from '../functions/gmail-listener/src/types/email';
import logger from './utils/logger';
import { EmailProvider } from '../functions/gmail-listener/src/types/email';
import { GmailService } from '../functions/gmail-listener/src/gmailRefreshTokenService';
import { EmailMonitor } from './services/emailMonitor';

dotenv.config();

export function createEmailConfig(): EmailConfig {
  const providerStr = process.env.EMAIL_PROVIDER;
  const provider = providerStr as EmailProvider;

  const config: EmailConfig = {
    provider,
    email: process.env.EMAIL_ADDRESS || '',
    domain: process.env.TECHNOGYM_DOMAIN || 'mywellness.com'
  };

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
    let emailService;
    
    if (config.provider === 'gmail') {
      emailService = new GmailService(config);
    }
    else {
      logger.error('Failed to configure email service, ensure EMAIL_PROVIDER is set to "${EmailProvider.Gmail}" or "${EmailProvider.Outlook}"');
      process.exit(1);
    }
    
    const emailMonitor = new EmailMonitor(config, emailService);
    const scheduler = new EmailScheduler(intervalMinutes, emailMonitor);
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
