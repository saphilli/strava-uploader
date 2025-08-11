import { cloudEvent } from '@google-cloud/functions-framework';
import { handleGmailNotification } from './gmail-listener';

// Register the Cloud Function
cloudEvent('gmail-listener', handleGmailNotification);

// Export for testing purposes
export { handleGmailNotification };