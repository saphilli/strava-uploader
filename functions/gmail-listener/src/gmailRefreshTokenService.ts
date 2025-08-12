import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import { Credentials } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

let gmail = google.gmail('v1');

export async function connect(): Promise<void> {
  try {
    await initializeGmail()
    await gmail!.users.getProfile({ userId: 'me' });
    console.log('Connected to Gmail successfully');
  } catch (error) {
    console.log('Failed to connect to email provider:', error);
    throw error;
  }
}

async function initializeGmail(): Promise<void>
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
    const { client_id, client_secret, redirect_uris } = credentialsData.installed;

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

    gmail = google.gmail({ version: 'v1', auth});
  } catch (error)
  {
    console.log('Failed to initialize Gmail OAuth:', error);
    throw error;
  }
}