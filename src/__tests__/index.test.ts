import { EmailMonitor } from '../services/emailMonitor';
import { EmailScheduler } from '../services/scheduler';
import { EmailProvider } from '../types/email';

// Mock dependencies
jest.mock('../services/scheduler');
jest.mock('../utils/logger');
// Prevent dotenv from loading .env file
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

describe('index.ts', () => {
  let mockScheduler: jest.Mocked<EmailScheduler>;
  let mockExit: jest.SpyInstance;
  let mockConsoleLog: jest.SpyInstance;

  beforeEach(() => {
    // Clear mocks but don't reset modules for now
    jest.clearAllMocks();
    
    // Mock process.exit
    mockExit = jest.spyOn(process, 'exit').mockImplementation();
    
    // Mock console.log to avoid noise in tests
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    
    // Create mock scheduler instance
    mockScheduler = {
      startScheduledMonitoring: jest.fn().mockResolvedValue(undefined),
      startContinuousMonitoring: jest.fn().mockResolvedValue(undefined),
      runOnce: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      isRunning: jest.fn().mockReturnValue(false)
    } as unknown as jest.Mocked<EmailScheduler>;
    
    // Mock EmailScheduler constructor
    (EmailScheduler as jest.MockedClass<typeof EmailScheduler>).mockImplementation(() => {
      return mockScheduler;
    });
    
  });
  
  afterEach(() => {    
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    process.env = {};
  });

  describe('createEmailConfig', () => {
    it('should throw error for invalid provider', async () => {
      process.env.EMAIL_PROVIDER = 'invalid';
      process.env.EMAIL_ADDRESS = 'test@gmail.com';
      
      const { createEmailConfig } = require('../index');
      
      expect(() => createEmailConfig()).toThrow(`EMAIL_PROVIDER must be either "${EmailProvider.Gmail}" or "${EmailProvider.Outlook}"`);
    });

    it('should create Gmail config with default domain', async () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_ADDRESS = 'test@gmail.com';

      const { createEmailConfig } = require('../index');
      let config = createEmailConfig();

      expect(config).toMatchObject({
        provider: 'gmail',
        email: 'test@gmail.com',
        domain: 'mywellness.com'
      });
    });

    it('should create Gmail config with custom domain', async () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_ADDRESS = 'test@gmail.com';
      process.env.TECHNOGYM_DOMAIN = 'custom.com';
      
      const { createEmailConfig } = require('../index');      
      let config = createEmailConfig();

      expect(config).toMatchObject({
        provider: 'gmail',
        email: 'test@gmail.com',
        domain: 'custom.com'
      });
    });

    it('should create Outlook config with auth credentials', async () => {
      process.env.EMAIL_PROVIDER = 'outlook';
      process.env.EMAIL_ADDRESS = 'test@outlook.com';
      process.env.OUTLOOK_CLIENT_ID = 'client-id';
      process.env.OUTLOOK_CLIENT_SECRET = 'client-secret';
      process.env.OUTLOOK_REFRESH_TOKEN = 'refresh-token';
      
      const { createEmailConfig } = require('../index');
      
      let config = createEmailConfig();
      
      expect(config).toMatchObject({
        provider: 'outlook',
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token'
        }
      });
    });

    it('should throw error for invalid provider', async () => {
      process.env.EMAIL_PROVIDER = 'invalid';
      
      const { createEmailConfig } = require('../index');
      
      expect(() => createEmailConfig()).toThrow(`EMAIL_PROVIDER must be either "${EmailProvider.Gmail}" or "${EmailProvider.Outlook}"`);
    });

    it('should throw error for missing EMAIL_ADDRESS', async () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      // EMAIL_ADDRESS not set
      
      const { createEmailConfig } = require('../index');
      
      expect(() => createEmailConfig()).toThrow('EMAIL_ADDRESS is required in environment variables.');
    });

    it('should throw error for missing Outlook credentials', async () => {
      process.env.EMAIL_PROVIDER = 'outlook';
      process.env.EMAIL_ADDRESS = 'test@outlook.com';
      // Missing OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_REFRESH_TOKEN
      
        const { createEmailConfig } = require('../index');
      
      expect(() => createEmailConfig()).toThrow('Missing required Outlook configuration. Check your environment variables.');
    });
  });

  describe('main function', () => {
    beforeEach(() => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_ADDRESS = 'test@gmail.com';
    });

    it('should start scheduled monitoring by default', async () => {
      const { main } = require('../index');
      
      await main();

      expect(mockScheduler.startScheduledMonitoring).toHaveBeenCalled();
      expect(mockScheduler.startContinuousMonitoring).not.toHaveBeenCalled();
      expect(mockScheduler.runOnce).not.toHaveBeenCalled();
    });

    it('should start scheduled monitoring when MODE=scheduled', async () => {
      process.env.MODE = 'scheduled';
      
      const { main } = require('../index');
      
      await main();      

      expect(mockScheduler.startScheduledMonitoring).toHaveBeenCalled();
      expect(mockScheduler.startContinuousMonitoring).not.toHaveBeenCalled();
      expect(mockScheduler.runOnce).not.toHaveBeenCalled();
    });

    it('should start continuous monitoring when MODE=continuous', async () => {
      process.env.MODE = 'continuous';
      
      const { main } = require('../index');
      
      await main();      

      expect(mockScheduler.startContinuousMonitoring).toHaveBeenCalled();
      expect(mockScheduler.startScheduledMonitoring).not.toHaveBeenCalled();
      expect(mockScheduler.runOnce).not.toHaveBeenCalled();
    });

    it('should run once when MODE=once', async () => {
      process.env.MODE = 'once';
      
      const { main } = require('../index');
      
      await main();

      expect(mockScheduler.runOnce).toHaveBeenCalled();
      expect(mockScheduler.startContinuousMonitoring).not.toHaveBeenCalled();
      expect(mockScheduler.startScheduledMonitoring).not.toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should use custom interval from environment', async () => {
      process.env.MONITOR_INTERVAL_MINUTES = '10';
      
      const { main } = require('../index');
      
      await main();

      expect(EmailScheduler).toHaveBeenCalledWith(
        10,
        expect.any(EmailMonitor)
      );
    });

    it('should handle startup errors', async () => {
      mockScheduler.startScheduledMonitoring.mockRejectedValue(new Error('Startup failed'));
      
      const { main } = require('../index');
      
      await main();      
      
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('signal handlers', () => {
    it('should handle SIGINT gracefully', async () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_ADDRESS = 'test@gmail.com';
      
      const { main } = require('../index');
      
      // Start the main function and wait for scheduler to be set up
      const mainPromise = main().catch(() => {});
      
      // Wait for the next tick to ensure signal handlers are registered
      await new Promise(resolve => setImmediate(resolve));
      
      // Simulate SIGINT
      process.emit('SIGINT', 'SIGINT');
      
      await mainPromise;
      
      expect(mockScheduler.stop).toHaveBeenCalled();
    });

    it('should handle SIGTERM gracefully', async () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_ADDRESS = 'test@gmail.com';
      
      const { main } = require('../index');
      
      // Start the main function and wait for scheduler to be set up
      const mainPromise = main().catch(() => {});
      
      // Wait for the next tick to ensure signal handlers are registered
      await new Promise(resolve => setImmediate(resolve));
      
      // Simulate SIGTERM
      process.emit('SIGTERM', 'SIGTERM');
      
      await mainPromise;
      
      expect(mockScheduler.stop).toHaveBeenCalled();
    });
  });
});