import { EmailScheduler } from '../services/scheduler';
import { EmailMonitor } from '../services/emailMonitor';
import * as cron from 'node-cron';

// Mock dependencies
jest.mock('../services/emailMonitor');
jest.mock('node-cron', () => ({
  schedule: jest.fn()
}));

const mockCron = cron as jest.Mocked<typeof cron>;

describe('EmailScheduler', () => {
  let scheduler: EmailScheduler;
  let mockEmailMonitor: jest.Mocked<EmailMonitor>;
  let mockCronJob: jest.Mocked<cron.ScheduledTask>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockEmailMonitor = {
      start: jest.fn().mockResolvedValue(undefined),
      checkForNewEmails: jest.fn().mockResolvedValue([]),
      processWorkoutEmail: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      isActive: jest.fn().mockReturnValue(false),
      emailService: {} as any,
      filter: {} as any,
      isRunning: jest.fn().mockReturnValue(false),
      logEmailDetails: jest.fn(),
      isWorkoutFile: jest.fn().mockReturnValue(false)
    } as unknown as jest.Mocked<EmailMonitor>;
    
    mockCronJob = {
      start: jest.fn(),
      stop: jest.fn(),
      destroy: jest.fn()
    } as unknown as jest.Mocked<cron.ScheduledTask>;

    (mockCron.schedule as jest.Mock).mockReturnValue(mockCronJob);

    scheduler = new EmailScheduler(5, mockEmailMonitor);
  });

  describe('constructor', () => {
    it('should create EmailScheduler instance', () => {
      expect(scheduler).toBeInstanceOf(EmailScheduler);
    });

    it('should set default interval to 5 minutes', () => {
      expect(scheduler['intervalMinutes']).toBe(5);
    });

    it('should accept custom interval', () => {
      const customScheduler = new EmailScheduler(10, mockEmailMonitor);
      expect(customScheduler['intervalMinutes']).toBe(10);
    });

    it('should use default interval when not specified', () => {
      const defaultScheduler = new EmailScheduler(undefined as unknown as number, mockEmailMonitor);
      expect(defaultScheduler['intervalMinutes']).toBe(5);
    });
  });

  describe('startScheduledMonitoring', () => {
    it('should start email monitor and schedule cron job', async () => {
      await scheduler.startScheduledMonitoring();

      expect(mockEmailMonitor.start).toHaveBeenCalled();
      expect(mockCron.schedule).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function));
      expect(scheduler.isRunning()).toBe(true);
    });

    it('should create correct cron expression for custom interval', async () => {
      const customScheduler = new EmailScheduler(10, mockEmailMonitor);
      await customScheduler.startScheduledMonitoring();

      expect(mockCron.schedule).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function));
    });

    it('should handle errors during startup', async () => {
      const error = new Error('Start failed');
      mockEmailMonitor.start.mockRejectedValue(error);

      await expect(scheduler.startScheduledMonitoring()).rejects.toThrow('Start failed');
      expect(mockCron.schedule).not.toHaveBeenCalled();
    });

    it('should execute scheduled email check successfully', async () => {
      const mockMessages = [
        { id: '1', from: 'test@example.com', subject: 'Test', date: new Date(), downloadLinks: [] },
        { id: '2', from: 'test2@example.com', subject: 'Test2', date: new Date(), downloadLinks: [] }
      ];
      
      mockEmailMonitor.checkForNewEmails.mockResolvedValue(mockMessages);
      
      await scheduler.startScheduledMonitoring();

      // Get the scheduled function and execute it
      const scheduledFunction = mockCron.schedule.mock.calls[0][1] as Function;
      await scheduledFunction();

      expect(mockEmailMonitor.checkForNewEmails).toHaveBeenCalled();
      expect(mockEmailMonitor.processWorkoutEmail).toHaveBeenCalledTimes(2);
      expect(mockEmailMonitor.processWorkoutEmail).toHaveBeenCalledWith(mockMessages[0]);
      expect(mockEmailMonitor.processWorkoutEmail).toHaveBeenCalledWith(mockMessages[1]);
    });

    it('should handle errors during scheduled execution', async () => {
      const error = new Error('Check failed');
      mockEmailMonitor.checkForNewEmails.mockRejectedValue(error);
      
      await scheduler.startScheduledMonitoring();

      // Get the scheduled function and execute it
      const scheduledFunction = mockCron.schedule.mock.calls[0][1] as Function;
      
      // Should not throw error, just log it
      await expect(scheduledFunction()).resolves.toBeUndefined();
      expect(mockEmailMonitor.checkForNewEmails).toHaveBeenCalled();
      expect(mockEmailMonitor.processWorkoutEmail).not.toHaveBeenCalled();
    });
  });

  describe('startContinuousMonitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start email monitor and begin continuous checking', async () => {
      scheduler.startContinuousMonitoring();
      
      // Allow the initial setup to complete
      await Promise.resolve();
      
      expect(mockEmailMonitor.start).toHaveBeenCalled();
      expect(mockEmailMonitor.checkForNewEmails).toHaveBeenCalled();
    });

    it('should process messages continuously', async () => {
      scheduler.startContinuousMonitoring();
      
      // Allow initial execution
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      
      expect(mockEmailMonitor.start).toHaveBeenCalled();
    });

    it('should handle errors during continuous monitoring startup', async () => {
      const error = new Error('Start failed');
      mockEmailMonitor.start.mockRejectedValue(error);

      await expect(scheduler.startContinuousMonitoring()).rejects.toThrow('Start failed');
    });

    it('should handle errors during continuous monitoring execution', async () => {
      const error = new Error('Check failed');
      mockEmailMonitor.checkForNewEmails.mockRejectedValue(error);
      
      scheduler.startContinuousMonitoring();
      
      // Allow initial execution
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      
      // Should not throw, just log the error
      expect(mockEmailMonitor.start).toHaveBeenCalled();
      expect(mockEmailMonitor.checkForNewEmails).toHaveBeenCalled();
    });
  });

  describe('runOnce', () => {
    it('should start monitor, check emails once, and stop', async () => {
      const mockMessages = [
        { id: '1', from: 'test@example.com', subject: 'Test', date: new Date(), downloadLinks: [] }
      ];
      
      mockEmailMonitor.checkForNewEmails.mockResolvedValue(mockMessages);
      
      await scheduler.runOnce();

      expect(mockEmailMonitor.start).toHaveBeenCalled();
      expect(mockEmailMonitor.checkForNewEmails).toHaveBeenCalledTimes(1);
      expect(mockEmailMonitor.processWorkoutEmail).toHaveBeenCalledWith(mockMessages[0]);
      expect(mockEmailMonitor.stop).toHaveBeenCalled();
    });

    it('should handle multiple messages in runOnce', async () => {
      const mockMessages = [
        { id: '1', from: 'test1@example.com', subject: 'Test1', date: new Date(), downloadLinks: [] },
        { id: '2', from: 'test2@example.com', subject: 'Test2', date: new Date(), downloadLinks: [] },
        { id: '3', from: 'test3@example.com', subject: 'Test3', date: new Date(), downloadLinks: [] }
      ];
      
      mockEmailMonitor.checkForNewEmails.mockResolvedValue(mockMessages);
      
      await scheduler.runOnce();

      expect(mockEmailMonitor.processWorkoutEmail).toHaveBeenCalledTimes(3);
      mockMessages.forEach(message => {
        expect(mockEmailMonitor.processWorkoutEmail).toHaveBeenCalledWith(message);
      });
    });

    it('should handle errors during runOnce', async () => {
      const error = new Error('Start failed');
      mockEmailMonitor.start.mockRejectedValue(error);

      await expect(scheduler.runOnce()).rejects.toThrow('Start failed');
      expect(mockEmailMonitor.checkForNewEmails).not.toHaveBeenCalled();
      expect(mockEmailMonitor.stop).not.toHaveBeenCalled();
    });

    it('should handle errors during email checking in runOnce', async () => {
      const error = new Error('Check failed');
      mockEmailMonitor.checkForNewEmails.mockRejectedValue(error);

      await expect(scheduler.runOnce()).rejects.toThrow('Check failed');
      expect(mockEmailMonitor.start).toHaveBeenCalled();
      expect(mockEmailMonitor.processWorkoutEmail).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop scheduler without errors when no cron job', () => {
      expect(() => scheduler.stop()).not.toThrow();
      expect(mockCronJob.stop).not.toHaveBeenCalled();
    });

    it('should stop cron job when running', async () => {
      await scheduler.startScheduledMonitoring();
      
      scheduler.stop();
      
      expect(mockCronJob.stop).toHaveBeenCalled();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should stop email monitor if active', async () => {
      mockEmailMonitor.isActive.mockReturnValue(true);
      await scheduler.startScheduledMonitoring();
      
      scheduler.stop();
      
      expect(mockEmailMonitor.stop).toHaveBeenCalled();
    });

    it('should not stop email monitor if not active', async () => {
      mockEmailMonitor.isActive.mockReturnValue(false);
      await scheduler.startScheduledMonitoring();
      
      scheduler.stop();
      
      expect(mockEmailMonitor.stop).not.toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    it('should return false when not running', () => {
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should return true when scheduled monitoring is active', async () => {
      await scheduler.startScheduledMonitoring();
      expect(scheduler.isRunning()).toBe(true);
    });

    it('should return false after stopping', async () => {
      await scheduler.startScheduledMonitoring();
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });
  });
});