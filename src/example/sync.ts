import {ACPFactory} from '../factory/client-factory'
import { MessagingPlatform } from '../platform/platform';
async function testSync(){
    const acpClient = ACPFactory.createClient(MessagingPlatform.SendingNetwork,processMessage);
    var res=await acpClient.login("wallet_address","wallet_private_key","device_id");
    console.log('login ',res);
    console.log('client ', acpClient);

    var nextBatch=""
    while(1){
        var resp=await acpClient.sync("",nextBatch,{})
        console.log('sync resp ',resp);

        await acpClient.processSync(resp[0],res[0],res[1],nextBatch)
        nextBatch=resp[1]
    }

};

testSync();

function processMessage(message: string, roomId: string, senderId: string): string {
    // Here you can process the message and return the response
    // This is just a placeholder, you can implement it according to your logic
    return `Processed: ${message}`;
}