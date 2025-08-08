import { google } from 'googleapis';
import { gmail_v1 } from 'googleapis/build/src/apis/gmail/v1';
import { authenticate } from '@google-cloud/local-auth';
import { Credentials } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import { EmailConfig, EmailMessage, EmailFilter } from '../../functions/gmail-listener/types/email';
import { BaseEmailService } from './emailService'; 

export class GmailService extends BaseEmailService {
  private gmail?: gmail_v1.Gmail; 
  
  constructor(config: EmailConfig) {
    super(config);
  }
  
  async connect(): Promise<void> {
    try {
      await this.initializeGmail()
      await this.gmail!.users.getProfile({ userId: 'me' });
      logger.info('Connected to Gmail successfully');
    } catch (error) {
      logger.error('Failed to connect to email provider:', error);
      throw error;
    }
  }

  private async initializeGmail(): Promise<void>
  {
    const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
    const TOKEN_PATH = path.join(process.cwd(), 'credentials', 'token.json');
    const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials', 'credentials.json');

    try {
      if (!fs.existsSync(CREDENTIALS_PATH))
      {
        throw new Error('credentials.json file not found. Please download it from Google Cloud Console.');
      }
      
      const credentialsData = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
      const { client_id, client_secret, redirect_uris } = credentialsData.installed || credentialsData.web;

      if (!credentialsData || !client_id || !client_secret || !redirect_uris) {
        throw new Error('Invalid or incomplete credentials.json file. Ensure client_id, client_secret, and redirect_uris are present.')
      }

      let auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
      let tokenData: Credentials = {};
      if (fs.existsSync(TOKEN_PATH)) 
      {
        tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      } 
      
      if (tokenData.access_token && tokenData.refresh_token) {
        auth.setCredentials(tokenData);

      }
      else {
        let authenticatedClient = await authenticate({
          scopes: SCOPES,
          keyfilePath: CREDENTIALS_PATH,
        });
        
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(authenticatedClient.credentials));        
        auth.setCredentials(authenticatedClient.credentials);
      }

      this.gmail = google.gmail({ version: 'v1', auth});
    } catch (error)
    {
      logger.error('Failed to initialize Gmail OAuth:', error);
      throw error;
    }
  }
 
  async getMessages(filter: EmailFilter): Promise<EmailMessage[]> {
    if (!this.gmail) {
      throw new Error('Gmail service not initialized. Call connect() first.');
    }
    
    const query = `from:${filter.fromDomain}`;
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 1
    });

    const messages: EmailMessage[] = [];
    
    if (response.data.messages) {
      for (const message of response.data.messages) {
        if (!message.id) continue;
        
        const fullMessage = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        const parsedMessage = this.parseGmailMessage(fullMessage.data);
        messages.push(parsedMessage);
      }
    }

    logger.info(`Retrieved ${messages.length} messages from Gmail`);
    return messages;
  }

  private parseGmailMessage(message: gmail_v1.Schema$Message): EmailMessage {
    const headers = message.payload?.headers || [];
    const from = headers.find((h: gmail_v1.Schema$MessagePartHeader) => h.name === 'From')?.value || ''; 
    const subject = headers.find((h: gmail_v1.Schema$MessagePartHeader) => h.name === 'Subject')?.value || ''; 
    const date = new Date(headers.find((h: gmail_v1.Schema$MessagePartHeader) => h.name === 'Date')?.value || ''); 

    const downloadLinks: string[] = [];
    
    // Extract email body content
    const emailBody = this.extractEmailBody(message.payload);
    
    // Extract download links from the email body
    if (emailBody) {
      const linkMatches = emailBody.match(/href\s*=\s*["']([^"']*\.tcx[^"']*)["']/gi);
      if (linkMatches) {
        for (const match of linkMatches) {
          const urlMatch = match.match(/href\s*=\s*["']([^"']+)["']/i);
          if (urlMatch) {
            downloadLinks.push(urlMatch[1]);
          }
        }
      }
    }

    return {
      id: message.id || '',
      from,
      subject,
      date,
      downloadLinks
    };
  }

  private extractEmailBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return '';
    
    // If this part has a body directly
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    
    // If this part has nested parts, recursively search
    if (payload.parts) {
      for (const part of payload.parts) {
        // Look for HTML or plain text parts
        if (part.mimeType === 'text/html' || part.mimeType === 'text/plain') {
          if (part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
        
        // Recursively search nested parts
        const nestedBody = this.extractEmailBody(part);
        if (nestedBody) {
          return nestedBody;
        }
      }
    }
    
    return '';
  }
}