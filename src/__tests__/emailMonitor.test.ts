import { EmailMonitor } from '../services/emailMonitor';
import { EmailConfig, EmailProvider, EmailMessage } from '../types/email';
import { EmailService } from '../services/emailService';

// Mock EmailService
jest.mock('../services/emailService');

describe('EmailMonitor', () => {
  let emailMonitor: EmailMonitor;
  let mockConfig: EmailConfig;
  let mockEmailService: jest.Mocked<EmailService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      provider: EmailProvider.Gmail,
      email: 'test@gmail.com',
      domain: 'mywellness.com'
    };
    
    mockEmailService = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      getMessages: jest.fn().mockResolvedValue([]),
      downloadAttachment: jest.fn().mockResolvedValue(Buffer.from('test data'))
    } as any;
    
    (EmailService as jest.MockedClass<typeof EmailService>).mockImplementation(() => mockEmailService);
    
    emailMonitor = new EmailMonitor(mockConfig);
  });

  describe('constructor', () => {
    it('should create EmailMonitor instance', () => {
      expect(emailMonitor).toBeInstanceOf(EmailMonitor);
    });

    it('should set up filter with correct domain', () => {
      expect(emailMonitor['filter']).toEqual({
        fromDomain: 'mywellness.com',
        hasAttachments: false
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
      mockEmailService.connect.mockRejectedValue(error);
      
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

  describe('isTechnogymEmail', () => {
    it('should identify Technogym emails correctly', () => {
      expect(emailMonitor['isTechnogymEmail']('test@mywellness.com')).toBe(true);
      expect(emailMonitor['isTechnogymEmail']('user@MYWELLNESS.COM')).toBe(true);
      expect(emailMonitor['isTechnogymEmail']('test@gmail.com')).toBe(false);
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
      mockEmailService.getMessages.mockResolvedValue([]);
      
      const result = await emailMonitor.checkForNewEmails();
      
      expect(result).toEqual([]);
      expect(mockEmailService.getMessages).toHaveBeenCalledWith({
        fromDomain: 'mywellness.com',
        hasAttachments: false
      });
    });

    it('should filter and return Technogym emails with attachments', async () => {
      emailMonitor['isRunning'] = true;
      
      const mockMessages: EmailMessage[] = [
        {
          id: '1',
          from: 'test@mywellness.com',
          subject: 'Workout Data',
          date: new Date(),
          hasAttachments: true,
          attachments: [{ filename: 'workout.tcx', contentType: 'text/xml', size: 1024, data: Buffer.from('') }]
        },
        {
          id: '2',
          from: 'other@gmail.com',
          subject: 'Other Email',
          date: new Date(),
          hasAttachments: true,
          attachments: [{ filename: 'doc.pdf', contentType: 'application/pdf', size: 2048, data: Buffer.from('') }]
        },
        {
          id: '3',
          from: 'admin@mywellness.com',
          subject: 'No Attachments',
          date: new Date(),
          hasAttachments: false,
          attachments: []
        }
      ];
      
      mockEmailService.getMessages.mockResolvedValue(mockMessages);
      
      const result = await emailMonitor.checkForNewEmails();
      
      expect(result).toHaveLength(1);
      expect(result[0].from).toBe('test@mywellness.com');
      expect(result[0].hasAttachments).toBe(true);
    });

    it('should handle errors from email service', async () => {
      emailMonitor['isRunning'] = true;
      const error = new Error('Service error');
      mockEmailService.getMessages.mockRejectedValue(error);
      
      await expect(emailMonitor.checkForNewEmails()).rejects.toThrow('Service error');
    });
  });

  describe('processWorkoutEmail', () => {
    const mockMessage: EmailMessage = {
      id: 'msg-1',
      from: 'test@mywellness.com',
      subject: 'Workout Data',
      date: new Date(),
      hasAttachments: true,
      attachments: [
        { filename: 'workout.tcx', contentType: 'text/xml', size: 1024, data: Buffer.from('') },
        { filename: 'data.gpx', contentType: 'application/gpx', size: 2048, data: Buffer.from('') },
        { filename: 'document.pdf', contentType: 'application/pdf', size: 3072, data: Buffer.from('') }
      ]
    };

    it('should process workout files and skip non-workout files', async () => {
      await emailMonitor.processWorkoutEmail(mockMessage);
      
      expect(mockEmailService.downloadAttachment).toHaveBeenCalledTimes(2);
      expect(mockEmailService.downloadAttachment).toHaveBeenCalledWith('msg-1', 'workout.tcx');
      expect(mockEmailService.downloadAttachment).toHaveBeenCalledWith('msg-1', 'data.gpx');
      expect(mockEmailService.downloadAttachment).not.toHaveBeenCalledWith('msg-1', 'document.pdf');
    });

    it('should handle download errors gracefully', async () => {
      mockEmailService.downloadAttachment.mockRejectedValue(new Error('Download failed'));
      
      await expect(emailMonitor.processWorkoutEmail(mockMessage)).resolves.not.toThrow();
      expect(mockEmailService.downloadAttachment).toHaveBeenCalled();
    });

    it('should process message with no workout files', async () => {
      const messageWithoutWorkoutFiles: EmailMessage = {
        ...mockMessage,
        attachments: [{ filename: 'document.pdf', contentType: 'application/pdf', size: 1024, data: Buffer.from('') }]
      };
      
      await emailMonitor.processWorkoutEmail(messageWithoutWorkoutFiles);
      
      expect(mockEmailService.downloadAttachment).not.toHaveBeenCalled();
    });
  });
});