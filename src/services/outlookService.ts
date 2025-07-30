import Imap from 'imap';
import logger from '../utils/logger';
import { EmailConfig, EmailMessage, EmailFilter } from '../types/email';
import { BaseEmailService } from './emailService';

export class OutlookService extends BaseEmailService {
  private imap?: Imap;

  constructor(config: EmailConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    if (!this.config.auth) {
      throw new Error('OAuth configuration is required for Outlook');
    }

    return new Promise((resolve, reject) => {
      try {
        this.imap = new Imap({
          user: this.config.email,
          password: this.config.auth!.refreshToken,
          host: 'outlook.office365.com',
          port: 993,
          tls: true,
          tlsOptions: { rejectUnauthorized: false }
        });

        this.imap.once('ready', () => {
          logger.info('Connected to Outlook successfully');
          resolve();
        });

        this.imap.once('error', (err: Error) => {
          logger.error('Failed to connect to email provider:', err);
          reject(err);
        });

        this.imap.connect();
      } catch (error) {
        logger.error('Failed to connect to email provider:', error);
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.imap) {
      this.imap.end();
    }
    logger.info('Disconnected from email provider');
  }

  async getMessages(filter: EmailFilter): Promise<EmailMessage[]> {
    return new Promise((resolve, reject) => {
      if (!this.imap) {
        reject(new Error('IMAP not initialized'));
        return;
      }

      this.imap.openBox('INBOX', true, (err) => {
        if (err) {
          reject(err);
          return;
        }

        const searchCriteria = ['UNSEEN', ['FROM', filter.fromDomain]];
        
        this.imap!.search(searchCriteria, (err) => {
          if (err) {
            reject(err);
            return;
          }

          const messages: EmailMessage[] = [];
          resolve(messages);
        });
      });
    });
  }
}