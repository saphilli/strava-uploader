import { EmailScheduler } from '../services/scheduler';
import { EmailConfig } from '../types/email';

// Mock dependencies
jest.mock('../services/emailMonitor');
jest.mock('node-cron');

describe('EmailScheduler', () => {
  let scheduler: EmailScheduler;
  let mockConfig: EmailConfig;

  beforeEach(() => {
    mockConfig = {
      provider: 'gmail',
      email: 'test@gmail.com',
      domain: 'mywellness.com'
    };
    
    scheduler = new EmailScheduler(mockConfig, 5);
  });

  describe('constructor', () => {
    it('should create EmailScheduler instance', () => {
      expect(scheduler).toBeInstanceOf(EmailScheduler);
    });

    it('should set default interval to 5 minutes', () => {
      expect(scheduler['intervalMinutes']).toBe(5);
    });

    it('should accept custom interval', () => {
      const customScheduler = new EmailScheduler(mockConfig, 10);
      expect(customScheduler['intervalMinutes']).toBe(10);
    });
  });

  describe('stop', () => {
    it('should stop scheduler without errors', () => {
      expect(() => scheduler.stop()).not.toThrow();
    });
  });

  describe('isRunning', () => {
    it('should return false when not running', () => {
      expect(scheduler.isRunning()).toBe(false);
    });
  });
});