import { EmailService } from './emailService';
import { EmailConfig, EmailMessage, EmailFilter } from '../types/email';
import logger from '../utils/logger';

export class EmailMonitor {
  private emailService: EmailService;
  private filter: EmailFilter;
  private isRunning = false;
  private technogymDomain= '';
  
  
  constructor(config: EmailConfig) {
    this.technogymDomain = config.domain;
    this.emailService = new EmailService(config);
    this.filter = {
      fromDomain: config.domain,
      hasAttachments: true
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
      
      const technogymMessages = messages.filter(msg => 
        this.isTechnogymEmail(msg.from) && msg.hasAttachments
        );
        
        if (technogymMessages.length > 0) {
          logger.info(`Found ${technogymMessages.length} new Technogym emails with attachments`);
          
          for (const message of technogymMessages) {
            this.logEmailDetails(message);
          }
        } else {
          logger.info('No new Technogym emails with attachments found');
        }
        
        return technogymMessages;
      } catch (error) {
        logger.error('Error checking for new emails:', error);
        throw error;
      }
    }
  
    async processWorkoutEmail(message: EmailMessage): Promise<void> {
      logger.info(`Processing workout email: ${message.subject}`);
      
      for (const attachment of message.attachments) {
        if (this.isWorkoutFile(attachment.filename)) {
          logger.info(`Found workout file: ${attachment.filename}`);
          
          try {
            const attachmentData = await this.emailService.downloadAttachment(
              message.id, 
              attachment.filename
            );
            
            logger.info(`Downloaded workout file: ${attachment.filename} (${attachmentData.length} bytes)`);
            
          } catch (error) {
            logger.error(`Failed to download attachment ${attachment.filename}:`, error);
          }
        }
      }
    }
    
    private isTechnogymEmail(fromAddress: string): boolean {
      return fromAddress.toLowerCase().includes(this.technogymDomain);
    }
    
    private logEmailDetails(message: EmailMessage): void {
      logger.info('Processing Technogym email:', {
      id: message.id,
      from: message.from,
      subject: message.subject,
      date: message.date,
      attachmentCount: message.attachments.length,
      attachments: message.attachments.map(att => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size
      }))
    });
  }

  private isWorkoutFile(filename: string): boolean {
    const workoutExtensions = ['.tcx', '.gpx', '.fit', '.json', '.xml'];
    return workoutExtensions.some(ext => 
      filename.toLowerCase().endsWith(ext)
    );
  }
}