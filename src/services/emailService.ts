import https from 'https';
import http from 'http';
import logger from '../utils/logger';
import { EmailConfig, EmailMessage, EmailFilter } from '../types/email';

export interface IEmailService {
  connect(): Promise<void>;
  disconnect(): void;
  getMessages(filter: EmailFilter): Promise<EmailMessage[]> 
  downloadWorkoutFile(url: string, filename?: string): Promise<{ filename: string; data: Buffer }>
}

export abstract class BaseEmailService implements IEmailService {
  protected config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract getMessages(filter: EmailFilter): Promise<EmailMessage[]>;

  disconnect(): void {} // Default empty implementation

  async downloadWorkoutFile(url: string, filename?: string): Promise<{ filename: string; data: Buffer }> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      
      const request = client.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadWorkoutFile(redirectUrl, filename)
              .then(resolve)
              .catch(reject);
            return;
          }
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
          return;
        }
        
        const chunks: Buffer[] = [];
        
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        response.on('end', () => {
          const data = Buffer.concat(chunks);
          
          // Extract filename from URL or Content-Disposition header
          let finalFilename = filename;
          if (!finalFilename) {
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
              const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
              if (match && match[1]) {
                finalFilename = match[1].replace(/['"]/g, '');
              }
            }
            
            if (!finalFilename) {
              const urlParts = url.split('/');
              finalFilename = urlParts[urlParts.length - 1] || 'workout.tcx';
              if (!finalFilename.endsWith('.tcx')) {
                finalFilename += '.tcx';
              }
            }
          }
          
          logger.info(`Downloaded TCX file: ${finalFilename} (${data.length} bytes)`);
          resolve({ filename: finalFilename, data });
        });
        
        response.on('error', (error) => {
          reject(error);
        });
      });
      
      request.on('error', (error) => {
        reject(error);
      });
      
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }
}

