const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const { gmail } = require('googleapis/build/src/apis/gmail');

// If modifying these scopes
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'];

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// Reads previously authorized credentials from the save file.
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}


 //Serializes credentials to a file compatible with GoogleAUth.fromJSON.
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}


 // Load or request or authorization to call APIs.

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}


// getting the unread messages as it displays to the user what are the unread msg
async function getMessage(gmail, messageId) {
    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
      });
      return response.data;
    } catch (error) {
      console.error('Error getting message ${messageId}:, error.message');
      throw error;
    }
  }

// listing unread function
async function listUnreadMsg(gmail1,query){
    const response = await gmail1.users.messages.list(
        {
            userId:'me',
            q: query
        }
    );

    const unread = (response.data.messages);

    // for displaying the unread msg

    // if (unread.length > 0) {
    //     console.log('Unread messages:');
    //     for (const message of unread) {
    //       const fullMessage = await getMessage(gmail1, message.id);
    //     //   console.log('id'+message.id+': ', fullMessage.snippet);
    //     }
    //   } else {
    //     console.log('No unread messages found.');
    //   }
    
      return unread
}

async function replyToall(gmail, messageId, replyContent) {
    try {
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
      });
  
      // Extract the original message's headers, including "To" and "Cc"
      const headers = message.data.payload.headers;
      const toHeader = headers.find(header => header.name.toLowerCase() === 'to');
      const ccHeader = headers.find(header => header.name.toLowerCase() === 'cc');
  
      const toAddresses = (toHeader ? toHeader.value : '').split(', ');
      const ccAddresses = (ccHeader ? ccHeader.value : '').split(', ');
  
      // Combine "To" and "Cc" addresses to get all recipients
      const allRecipients = [...toAddresses, ...ccAddresses].filter(Boolean);
  
      // Craft the reply message
      const replyMessage = {
        to: allRecipients.join(', '), // Include all original recipients
        subject: `Re: ${message.data.subject}`,
        text: replyContent,
      };
  
      const raw = Buffer.from(
        `To: ${replyMessage.to}\r\n `+
        `Subject: ${replyMessage.subject}\r\n` +
        '\r\n' +
        `${replyMessage.text}`
      ).toString('base64');
  
      // Send the reply
      await gmail.users.messages.send({
        userId: 'me',
        resource: {
          raw,
          threadId: messageId,
        },
      });
  
      console.log('Reply sent successfully.');
    } catch (error) {
      console.error('Email already have been replied:');
    //   throw error;
    }
  }
  
// function to create a label
  async function createLabel(gmail, labelName) {
    try {
      const response = await gmail.users.labels.create({
        userId: 'me',
        resource: {
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
  
      console.log(`Label "${labelName}" created.`);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 409) {
        // console.log(Label "${labelName}" already exists.);
        const labels = await gmail.users.labels.list({
          userId: 'me',
        });
        


        return labels.data.labels.find((label) => label.name === labelName);
        console.log("pass the label");
      }
    //   throw error;
    }
}
  
// function to move the unreadmail to labels
  async function moveEmailToLabel(gmail, messageId, labelName) {
    try {
      
      // Get the ID of the label
      const label = await gmail.users.labels.get({
        userId: 'me',
        id: labelName,
      });
  
      // Modify the email by adding the label
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        resource: {
          addLabelIds: [label.data.id],
        },
      });
  
      console.log(`Email with ID "${messageId}" moved to label UNREADMSG.`);
    } catch (error) {
      console.error('Error moving email to label:', error.message);
    //   throw error;
    }
  }
  

// Execution starts here

async function main(){

  try {
    // getting the authorization information
    const auth = await authorize().catch(console.error)
    console.log("good to go!");

    // getting the gmail api function
    const gmail = google.gmail({version:'v1',auth})

    // getting unread messagess
    const msg = await listUnreadMsg(gmail,'label:inbox is:unread');

    async function runAtRandomInterval() {
    // looping the msg where it contains id and threadid
    for(const message of msg){

        // replying the email
        await replyToall(gmail,message.id,'Thank you for your Message!')

        // creating a label named 'UNREADMSG'
        const label = await createLabel(gmail,'UNREADMSG')

        // moving the unread email to labels
        await moveEmailToLabel(gmail,message.id,label.id)

        // Random interval between 20 to 45 seconds
        const randomInterval = Math.floor(Math.random() * (45000 - 20000 + 1)) + 20000; 
        setTimeout(runAtRandomInterval, randomInterval);
    }
  }
  // Initial call
  runAtRandomInterval();
} catch (error) {
  console.error('Error:', error.message);
}

}

// function calls starts here
authorize().then().catch(console.error);
main().catch(console.error)