import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailMonitor } from '../services/emailMonitor';
import { EmailConfig, EmailProvider, EmailMessage } from '../types/email';
import { IEmailService } from '../services/emailService';

describe('EmailMonitor', () => {
  const testDomain = 'mywellness.com';
  const testEmail = 'test@gmail.com';

  let emailMonitor: EmailMonitor;
  let mockConfig: EmailConfig;
  let mockEmailService: IEmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      provider: EmailProvider.Gmail,
      email: testEmail,
      domain: testDomain
    };
    
    mockEmailService = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      getMessages: vi.fn().mockResolvedValue([
        {
          id: '1',
          from: 'test@mywellness.com',
          subject: 'Workout Data',
          date: new Date('2023-01-01'),
          downloadLinks: ['https://example.com/workout1.tcx']
        },
        {
          id: '2',
          from: 'coach@mywellness.com',
          subject: 'Training Session',
          date: new Date('2023-01-02'),
          downloadLinks: ['https://example.com/workout2.gpx']
        }
      ]),
      downloadWorkoutFile: vi.fn().mockResolvedValue({ 
        filename: 'workout.tcx', 
        data: Buffer.from('test workout data')
      }),
      processWorkoutEmail: vi.fn().mockResolvedValue(undefined)
    } as IEmailService;
    
    emailMonitor = new EmailMonitor(mockConfig, mockEmailService);
  });

  describe('constructor', () => {
    it('should create EmailMonitor instance', () => {
      expect(emailMonitor).toBeInstanceOf(EmailMonitor);
    });

    it('should set up filter with correct domain', () => {
      expect(emailMonitor['filter']).toEqual({
        fromDomain: testDomain
      });
    });
  });

  describe('start', () => {
    it('should not start if already running', async () => {
      emailMonitor['isRunning'] = true;
      
      await emailMonitor.start();
      
      expect(emailMonitor['isRunning']).toBe(true);
      expect(mockEmailService.connect).not.toHaveBeenCalled();
    });

    it('should start successfully when not running', async () => {
      await emailMonitor.start();
      
      expect(mockEmailService.connect).toHaveBeenCalled();
      expect(emailMonitor.isActive()).toBe(true);
    });

    it('should throw error when email service connection fails', async () => {
      const error = new Error('Connection failed');
      (mockEmailService.connect as vi.Mock).mockRejectedValue(error);
      
      await expect(emailMonitor.start()).rejects.toThrow('Connection failed');
      expect(emailMonitor.isActive()).toBe(false);
    });
  });

  describe('stop', () => {
    it('should stop monitoring when running', () => {
      emailMonitor['isRunning'] = true;
      emailMonitor.stop();
      
      expect(emailMonitor['isRunning']).toBe(false);
      expect(mockEmailService.disconnect).toHaveBeenCalled();
    });

    it('should not stop when already stopped', () => {
      emailMonitor['isRunning'] = false;
      emailMonitor.stop();
      
      expect(emailMonitor['isRunning']).toBe(false);
      expect(mockEmailService.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('isActive', () => {
    it('should return running status', () => {
      emailMonitor['isRunning'] = true;
      expect(emailMonitor.isActive()).toBe(true);
      
      emailMonitor['isRunning'] = false;
      expect(emailMonitor.isActive()).toBe(false);
    });
  });


  describe('isWorkoutFile', () => {
    it('should identify workout files correctly', () => {
      expect(emailMonitor['isWorkoutFile']('workout.tcx')).toBe(true);
      expect(emailMonitor['isWorkoutFile']('data.gpx')).toBe(true);
      expect(emailMonitor['isWorkoutFile']('activity.fit')).toBe(true);
      expect(emailMonitor['isWorkoutFile']('report.json')).toBe(true);
      expect(emailMonitor['isWorkoutFile']('data.xml')).toBe(true);
      expect(emailMonitor['isWorkoutFile']('document.pdf')).toBe(false);
      expect(emailMonitor['isWorkoutFile']('image.jpg')).toBe(false);
    });
  });

  describe('checkForNewEmails', () => {
    it('should throw error when not running', async () => {
      emailMonitor['isRunning'] = false;
      
      await expect(emailMonitor.checkForNewEmails()).rejects.toThrow('Email monitor is not running');
    });

    it('should return empty array when no emails found', async () => {
      emailMonitor['isRunning'] = true;
      (mockEmailService.getMessages as vi.Mock).mockResolvedValue([]);
      
      const result = await emailMonitor.checkForNewEmails();
      
      expect(result).toEqual([]);
      expect(mockEmailService.getMessages).toHaveBeenCalledWith({
        fromDomain: testDomain
      });
    });

    it('should return all messages from email service', async () => {
      emailMonitor['isRunning'] = true;
      
      const mockMessages: EmailMessage[] = [
        {
          id: '1',
          from: `test@${testDomain}`,
          subject: 'Workout Data',
          date: new Date(),
          downloadLinks: ['link1', 'link2']
        },
        {
          id: '2',
          from: `other@${testDomain}`,
          subject: 'Other Email',
          date: new Date(),
          downloadLinks: ['link3']
        }
      ];
      
      (mockEmailService.getMessages as vi.Mock).mockResolvedValue(mockMessages);
      
      const result = await emailMonitor.checkForNewEmails();
      
      expect(result).toHaveLength(2);
      expect(result[0].from).toBe('test@mywellness.com');
      expect(result[1].from).toBe('other@mywellness.com');
    });

    it('should handle errors from email service', async () => {
      emailMonitor['isRunning'] = true;
      const error = new Error('Service error');
      (mockEmailService.getMessages as vi.Mock).mockRejectedValue(error);
      
      await expect(emailMonitor.checkForNewEmails()).rejects.toThrow('Service error');
    });
  });

  describe('processWorkoutEmail', () => {
    const mockMessage: EmailMessage = {
      id: 'msg-1',
      from: `test@{testDomain}`,
      subject: 'Workout Data',
      date: new Date(),
      downloadLinks: ['link1', 'link2'],
    };

    it('should download workout file from first download link', async () => {
      await emailMonitor.processWorkoutEmail(mockMessage);
      
      expect(mockEmailService.downloadWorkoutFile).toHaveBeenCalledTimes(1);
      expect(mockEmailService.downloadWorkoutFile).toHaveBeenCalledWith('link1', 30000, 'msg-1');
    });

    it('should handle download errors gracefully', async () => {
      (mockEmailService.downloadWorkoutFile as vi.Mock).mockRejectedValue(new Error('Download failed'));
      
      await expect(emailMonitor.processWorkoutEmail(mockMessage)).rejects.toThrow('Download failed');
      expect(mockEmailService.downloadWorkoutFile).toHaveBeenCalled();
    });

    it.skip('should process message with empty download links', async () => {
      const messageWithoutLinks: EmailMessage = {
        ...mockMessage,
        downloadLinks: []
      };
      
      await expect(emailMonitor.processWorkoutEmail(messageWithoutLinks)).rejects.toThrow();
    });
  });
});