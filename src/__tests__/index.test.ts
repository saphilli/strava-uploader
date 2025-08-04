import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { EmailMonitor } from '../services/emailMonitor';
import { EmailScheduler } from '../services/scheduler';
import { EmailProvider } from '../types/email';

// Mock dependencies
vi.mock('../services/scheduler');
vi.mock('../utils/logger');
// Prevent dotenv from loading .env file
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn()
  },
  config: vi.fn()
}));

describe('index.ts', () => {
  let mockScheduler: any;
  let mockExit: any;
  let mockConsoleLog: any;

  beforeEach(() => {
    // Clear mocks but don't reset modules for now
    vi.clearAllMocks();
    
    // Mock process.exit
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    
    // Mock console.log to avoid noise in tests
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation();
    
    // Create mock scheduler instance
    mockScheduler = {
      startScheduledMonitoring: vi.fn().mockResolvedValue(undefined),
      startContinuousMonitoring: vi.fn().mockResolvedValue(undefined),
      runOnce: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false)
    } as any;
    
    // Mock EmailScheduler constructor
    vi.mocked(EmailScheduler).mockImplementation((() => {
      return mockScheduler;
    }) as any);
    
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
      
      const indexModule = await import('../index');
      
      expect(() => indexModule.createEmailConfig()).toThrow(`EMAIL_PROVIDER must be either "${EmailProvider.Gmail}" or "${EmailProvider.Outlook}"`);
    });

    it('should create Gmail config with default domain', async () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_ADDRESS = 'test@gmail.com';

      const indexModule = await import('../index');
      let config = indexModule.createEmailConfig();

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
      
      const indexModule = await import('../index');      
      let config = indexModule.createEmailConfig();

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
      
      const indexModule = await import('../index');
      
      let config = indexModule.createEmailConfig();
      
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
      
      const indexModule = await import('../index');
      
      expect(() => indexModule.createEmailConfig()).toThrow(`EMAIL_PROVIDER must be either "${EmailProvider.Gmail}" or "${EmailProvider.Outlook}"`);
    });

    it('should throw error for missing EMAIL_ADDRESS', async () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      // EMAIL_ADDRESS not set
      
      const indexModule = await import('../index');
      
      expect(() => indexModule.createEmailConfig()).toThrow('EMAIL_ADDRESS is required in environment variables.');
    });

    it('should throw error for missing Outlook credentials', async () => {
      process.env.EMAIL_PROVIDER = 'outlook';
      process.env.EMAIL_ADDRESS = 'test@outlook.com';
      // Missing OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_REFRESH_TOKEN
      
        const indexModule = await import('../index');
      
      expect(() => indexModule.createEmailConfig()).toThrow('Missing required Outlook configuration. Check your environment variables.');
    });
  });

  describe('main function', () => {
    beforeEach(() => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_ADDRESS = 'test@gmail.com';
    });

    it('should start scheduled monitoring by default', async () => {
      const indexModule = await import('../index');
      
      await indexModule.main();

      expect(mockScheduler.startScheduledMonitoring).toHaveBeenCalled();
      expect(mockScheduler.startContinuousMonitoring).not.toHaveBeenCalled();
      expect(mockScheduler.runOnce).not.toHaveBeenCalled();
    });

    it('should start scheduled monitoring when MODE=scheduled', async () => {
      process.env.MODE = 'scheduled';
      
      const indexModule = await import('../index');
      
      await indexModule.main();      

      expect(mockScheduler.startScheduledMonitoring).toHaveBeenCalled();
      expect(mockScheduler.startContinuousMonitoring).not.toHaveBeenCalled();
      expect(mockScheduler.runOnce).not.toHaveBeenCalled();
    });

    it('should start continuous monitoring when MODE=continuous', async () => {
      process.env.MODE = 'continuous';
      
      const indexModule = await import('../index');
      
      await indexModule.main();      

      expect(mockScheduler.startContinuousMonitoring).toHaveBeenCalled();
      expect(mockScheduler.startScheduledMonitoring).not.toHaveBeenCalled();
      expect(mockScheduler.runOnce).not.toHaveBeenCalled();
    });

    it('should run once when MODE=once', async () => {
      process.env.MODE = 'once';
      
      const indexModule = await import('../index');
      
      await indexModule.main();

      expect(mockScheduler.runOnce).toHaveBeenCalled();
      expect(mockScheduler.startContinuousMonitoring).not.toHaveBeenCalled();
      expect(mockScheduler.startScheduledMonitoring).not.toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should use custom interval from environment', async () => {
      process.env.MONITOR_INTERVAL_MINUTES = '10';
      
      const indexModule = await import('../index');
      
      await indexModule.main();

      expect(EmailScheduler).toHaveBeenCalledWith(
        10,
        expect.any(EmailMonitor)
      );
    });

    it('should handle startup errors', async () => {
      mockScheduler.startScheduledMonitoring.mockRejectedValue(new Error('Startup failed'));
      
      const indexModule = await import('../index');
      
      await indexModule.main();      
      
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('signal handlers', () => {
    it('should handle SIGINT gracefully', async () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_ADDRESS = 'test@gmail.com';
      
      const indexModule = await import('../index');
      
      // Start the main function and wait for scheduler to be set up
      const mainPromise = indexModule.main().catch(() => {});
      
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
      
      const indexModule = await import('../index');
      
      // Start the main function and wait for scheduler to be set up
      const mainPromise = indexModule.main().catch(() => {});
      
      // Wait for the next tick to ensure signal handlers are registered
      await new Promise(resolve => setImmediate(resolve));
      
      // Simulate SIGTERM
      process.emit('SIGTERM', 'SIGTERM');
      
      await mainPromise;
      
      expect(mockScheduler.stop).toHaveBeenCalled();
    });
  });
});