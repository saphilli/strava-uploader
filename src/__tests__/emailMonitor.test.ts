import { EmailMonitor } from '../services/emailMonitor';
import { EmailConfig } from '../types/email';

// Mock EmailService
jest.mock('../services/emailService');

describe('EmailMonitor', () => {
  let emailMonitor: EmailMonitor;
  let mockConfig: EmailConfig;

  beforeEach(() => {
    mockConfig = {
      provider: 'gmail',
      email: 'test@gmail.com',
      domain: 'mywellness.com'
    };
    
    emailMonitor = new EmailMonitor(mockConfig);
  });

  describe('constructor', () => {
    it('should create EmailMonitor instance', () => {
      expect(emailMonitor).toBeInstanceOf(EmailMonitor);
    });

    it('should set up filter with correct domain', () => {
      expect(emailMonitor['filter']).toEqual({
        fromDomain: 'mywellness.com',
        hasAttachments: true
      });
    });
  });

  describe('start', () => {
    it('should not start if already running', async () => {
      emailMonitor['isRunning'] = true;
      
      await emailMonitor.start();
      
      expect(emailMonitor['isRunning']).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop monitoring', () => {
      emailMonitor['isRunning'] = true;
      emailMonitor.stop();
      
      expect(emailMonitor['isRunning']).toBe(false);
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
});