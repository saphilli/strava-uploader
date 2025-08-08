import { CloudEvent, cloudEvent } from '@google-cloud/functions-framework';
import { PubSub } from '@google-cloud/pubsub';
import { EmailConfig, EmailMessage, EmailFilter } from 'types/email';

interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

interface WorkoutEmailEvent {
  messageId: string;
  timestamp: string;
}

const pubsub = new PubSub();
const TOPIC_NAME = process.env.WORKOUT_EMAIL_TOPIC || 'workout-emails';

const config = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN || ''
    } as EmailConfig

/**
 * Cloud Function triggered by Gmail Pub/Sub notifications
 * Filters for emails from technogym domain and publishes message IDs to a topic
*/
@cloudEvent('gmail-listener')
export const handleGmailNotification = async (cloudEvent: CloudEvent<any>): Promise<void> => {
  try {
    console.log('Received Gmail notification:', cloudEvent.id);
    
    // Decode Pub/Sub message from Gmail
    const messageData = Buffer.from(cloudEvent.data.message.data, 'base64').toString();
    const notification: GmailNotification = JSON.parse(messageData);
    
    console.log('Gmail notification details:', {
      emailAddress: notification.emailAddress,
      historyId: notification.historyId
    });
    
    // Check if we have any new messages from technogym domain
    const messageIds = await findWorkoutEmails(notification.historyId);
    
    // // Publish each message ID to our processing topic
    // for (const messageId of messageIds) {
    //   await publishWorkoutEmailEvent(messageId);
    //   console.log(`Published message event for: ${messageId}`);
    // }
    
    console.log(`Processed ${messageIds.length} workout emails`);
    
  } catch (error) {
    console.error('Error processing Gmail notification:', error);
    throw error; // This will trigger retry with exactly-once delivery
  }
};

/**
 * Find new emails from technogym domain based on history ID
 */
async function findWorkoutEmails(historyId: string): Promise<string[]> {
  const { google } = await import('googleapis');
  
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    credentials: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken
    }
  });
  
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
  throw new Error('Missing required Gmail configuration (clientId, clientSecret, refreshToken). Check your environment variables.');
}
  const gmail = google.gmail({ version: 'v1', auth });
  
  try {
    // Get history since the last notification
    const historyResponse = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId,
    });
    
    const messageIds: string[] = [];
    const history = historyResponse.data.history || [];
    
    for (const historyItem of history) {
      const messages = historyItem.messages || [];
      
      for (const message of messages) {
        if (message.id && await isFromTechnogym(gmail, message.id)) {
          messageIds.push(message.id);
        }
      }
    }
    
    return messageIds;
    
  } catch (error) {
    console.error('Error fetching Gmail history:', error);
    return [];
  }
}

/**
 * Check if a message is from technogym
 */
async function isFromTechnogym(gmail: any, messageId: string): Promise<boolean> {
  try {
    const messageResponse = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From']
    });
    
    const headers = messageResponse.data.payload?.headers || [];
    const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
    const sender = fromHeader?.value?.toLowerCase() || '';
    
    return sender.includes(config.domain);
    
  } catch (error) {
    console.error(`Error checking message ${messageId}:`, error);
    return false;
  }
}

/**
 * Publish empty event with message ID to processing topic
 */
async function publishWorkoutEmailEvent(messageId: string): Promise<void> {
  const topic = pubsub.topic(TOPIC_NAME);
  
  const workoutEmailEvent: WorkoutEmailEvent = {
    messageId,
    timestamp: new Date().toISOString()
    };
  
  try {
    await topic.publishMessage({
      data: Buffer.from(JSON.stringify(workoutEmailEvent)),
      attributes: {
        messageId
      }
    });
    
    console.log(`Published event for message: ${messageId}`);
    
  } catch (error) {
    console.error(`Failed to publish event for message ${messageId}:`, error);
    throw error;
  }
}