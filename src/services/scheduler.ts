import * as cron from 'node-cron';
import { EmailMonitor } from '../services/emailMonitor';
import logger from '../utils/logger';

export class EmailScheduler {
  private emailMonitor: EmailMonitor;
  private cronJob?: cron.ScheduledTask;
  private intervalMinutes: number;

  constructor(intervalMinutes: number = 5, emailMonitor: EmailMonitor) {
    this.emailMonitor = emailMonitor;
    this.intervalMinutes = intervalMinutes;
  }

  async startScheduledMonitoring(): Promise<void> {
    try {
      await this.emailMonitor.start();
      
      const cronExpression = `*/${this.intervalMinutes} * * * *`;
      
      this.cronJob = cron.schedule(cronExpression, async () => {
        try {
          logger.info('Scheduled email check starting...');
          const messages = await this.emailMonitor.checkForNewEmails();
          
          for (const message of messages) {
            await this.emailMonitor.processWorkoutEmail(message);
          }
          
          logger.info('Scheduled email check completed');
        } catch (error) {
          logger.error('Error during scheduled email check:', error);
        }
      });

      logger.info(`Email monitoring scheduled every ${this.intervalMinutes} minutes`);
    } catch (error) {
      logger.error('Failed to start scheduled monitoring:', error);
      throw error;
    }
  }

  async startContinuousMonitoring(): Promise<void> {
    try {
      await this.emailMonitor.start();
      
      logger.info('Starting continuous email monitoring...');
      
      const checkEmails = async () => {
        try {
          const messages = await this.emailMonitor.checkForNewEmails();
          
          for (const message of messages) {
            await this.emailMonitor.processWorkoutEmail(message);
          }
        } catch (error) {
          logger.error('Error during continuous monitoring:', error);
        }
        
        setTimeout(checkEmails, this.intervalMinutes * 60 * 1000);
      };
      
      checkEmails();
    } catch (error) {
      logger.error('Failed to start continuous monitoring:', error);
      throw error;
    }
  }

  async runOnce(): Promise<void> {
    try {
      await this.emailMonitor.start();
      
      logger.info('Running one-time email check...');
      const messages = await this.emailMonitor.checkForNewEmails();
      
      for (const message of messages) {
        await this.emailMonitor.processWorkoutEmail(message);
      }
      
      this.emailMonitor.stop();
      logger.info('One-time email check completed');
    } catch (error) {
      logger.error('Error during one-time email check:', error);
      throw error;
    }
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = undefined;
      logger.info('Stopped scheduled monitoring');
    }
    
    if (this.emailMonitor.isActive()) {
      this.emailMonitor.stop();
    }
  }

  isRunning(): boolean {
    return this.cronJob !== undefined;
  }
}