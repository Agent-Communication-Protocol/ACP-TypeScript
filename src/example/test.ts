import {ACPFactory} from '../factory/client-factory'
import { MessagingPlatform } from '../platform/platform';
async function testFunc(){
    const acpClient = ACPFactory.createClient(MessagingPlatform.SendingNetwork,processMessage);
    var res=await acpClient.login("wallet_address","wallet_private_key","device_id");
    console.log('login ',res);
    console.log('client ', acpClient);
    var res2=await acpClient.joinRoom("","room_id")
    console.log('joinRoom ',res2);
    
    var res3=await acpClient.setNickname("","nickname")
    console.log('setNickname ',res3);

    var res4=await acpClient.setProfileImage("","","photo_url")
    console.log('setProfileImage ',res4);

    var res5=await acpClient.getProfileInfo(res[0])
    console.log('getProfileInfo ',res5);

    var res6=await acpClient.sendTextMessage("","room_id","hello world")
    console.log('sendTextMessage ',res6);

    var res7=await acpClient.leaveRoom("","room_id")
    console.log('leaveRoom ',res7);

};

testFunc();

function processMessage(message: string, roomId: string, senderId: string): string {
    // Here you can process the message and return the response
    // This is just a placeholder, you can implement it according to your logic
    return `Processed: ${message}`;
}