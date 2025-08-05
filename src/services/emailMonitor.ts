import { IEmailService } from './emailService';
import { EmailConfig, EmailMessage, EmailFilter } from '../types/email';
import logger from '../utils/logger';

export class EmailMonitor {
  private emailService: IEmailService;
  private filter: EmailFilter;
  private isRunning = false;
  
  constructor(config: EmailConfig, emailService: IEmailService) {
    this.emailService = emailService;
    this.filter = {
      fromDomain: config.domain
    };
  }
  
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Email monitor is already running');
      return;
    }
    
    try {
      await this.emailService.connect();
      this.isRunning = true;
      logger.info('Email monitor started successfully');
    } catch (error) {
      logger.error('Failed to start email monitor:', error);
      throw error;
    }
  }
  
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Email monitor is not running');
      return;
    }

    this.emailService.disconnect();
    this.isRunning = false;
    logger.info('Email monitor stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  async checkForNewEmails(): Promise<EmailMessage[]> {
    if (!this.isRunning) {
      throw new Error('Email monitor is not running');
    }
    
    try {
      logger.info('Checking for new emails from Technogym...');
      const messages = await this.emailService.getMessages(this.filter);
      
        if (messages.length > 0) {
          logger.info(`Found ${messages.length} new Technogym email.`);
          
          for (const message of messages) {
            this.logEmailDetails(message);
          }
        } else {
          logger.info('No new Technogym emails found');
        }
        
        return messages;
      } catch (error) {
        logger.error('Error checking for new emails:', error);
        throw error;
      }
    }
  
    async processWorkoutEmail(message: EmailMessage): Promise<void> {
      logger.info(`Processing workout email: ${message.subject}`);

      await this.emailService.downloadWorkoutFile(message.downloadLinks[0], 30000, message.id);

      //TDO: Implement workout file processing logic
    }
    
    private logEmailDetails(message: EmailMessage): void {
      logger.info('Processing Technogym email:', {
      id: message.id,
      from: message.from,
      subject: message.subject,
      date: message.date,
      downloadLinks: message.downloadLinks
    });
  }

  private isWorkoutFile(filename: string): boolean {
    const workoutExtensions = ['.tcx', '.gpx', '.fit', '.json', '.xml'];
    return workoutExtensions.some(ext => 
      filename.toLowerCase().endsWith(ext)
    );
  }
}