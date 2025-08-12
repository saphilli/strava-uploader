import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from the gmail-listener directory
config({ path: join(__dirname, '..', '.env') });

import { cloudEvent } from '@google-cloud/functions-framework';
import { handleGmailNotification } from './gmail-listener';
import { connect } from './gmailRefreshTokenService';

const mode = process.env.MODE || 'normal';

if(mode === 'normal') {
// Register the Cloud Function
    cloudEvent('gmail-listener', handleGmailNotification);
}
else if(mode === 'setup') {
    // Run setup for Gmail authentication
    connect()
        .then(() => {
        console.log('Gmail authentication setup complete.');
        process.exit(0);
        })
        .catch(error => {
        console.error('Failed to setup Gmail authentication:', error);
        process.exit(1);
        });
}

