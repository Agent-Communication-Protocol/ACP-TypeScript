import sdk from "sendingnetwork-js-sdk";
import { AgentCommunication, onMessageType } from '../../interface/interface';
import { SendingNetworkAuth } from './auth';
import Web3 from 'web3'
import axios from 'axios';

const baseUrl = 'https://portal0101.sending.network'
interface SyncParams {
  timeout: string;
  since?: string;
  'dry-run'?: string;
}

export class SendingNetworkClient implements AgentCommunication {
  private sdnClient: sdk.SendingNetworkClient | null = null;
  private accessToken: string="";
  private userId: string="";
  private listeners: { [key: string]: ((...args: any[]) => void)[] } = {};
  private onMessage:onMessageType;
  constructor(onMsg: onMessageType) {
    this.sdnClient = null;
    this.accessToken = "";
    this.userId = "";
    this.onMessage = onMsg;
  }

  //authentication
  async register(address: string): Promise<[userId: string, status: string]> {
    return ["","success"];
  }

  async login(address: string, key: string, deviceId: string): Promise<[authToken: string, userId: string, status: string]> {
    const auth = new SendingNetworkAuth(baseUrl)
    try {
      let loginMessage = await auth.didPreLogin(address, deviceId)
      let web3 = new Web3()
      // sign with wallet account key
      const keyBytes = web3.utils.hexToBytes(key);
      let walletSignature = web3.eth.accounts.sign(loginMessage["message"], keyBytes)

      //did login
      let loginResp = await auth.didLogin(address,
          loginMessage["did"], loginMessage["message"], walletSignature["signature"],
          loginMessage["random_server"], loginMessage["updated"]);

      this.sdnClient=sdk.createClient({baseUrl: baseUrl,
        accessToken: loginResp["access_token"],
        userId: loginResp["user_id"]});
      this.accessToken=loginResp["access_token"];
      this.userId=loginResp["user_id"];
    
      return [loginResp["access_token"],loginResp["user_id"],"success"];
    } catch (error) {
      console.log("login err:",error)
      return ["","","fail"]
    }
  }

  async getChallenge(address: string): Promise<[challenge: string, challengeId: string, expiresAt: string]> {
    return ["","success",""]
  }
  async returnSignature(challengeId: string, signature: string): Promise<[userId: string, status: string, message: string]>{
    return ["","success",""]
  }

  //user
  async setNickname(authToken: string, nickname: string): Promise<[status: string, message: string]> {
    try {
      if (this.sdnClient!=null){
        await this.sdnClient.setDisplayName(nickname)
      }else{
        return ["fail","Need to log in first."]
      }
        return ["success",""]
    } catch (error) {
      console.log("setNickname err:",error)
      return ["fail",""]
    }
  }

  async setProfileImage(authToken: string, image: string, imageUrl: string): Promise<[status: string, message: string]>{
    try {
      if (this.sdnClient!=null){
        await this.sdnClient.setAvatarUrl(imageUrl)
      }else{
        return ["fail","Need to log in first."]
      }
        return ["success",""]
    } catch (error) {
      console.log("setProfileImage err:",error)
      return ["fail",""]
    }
  }

  async getProfileInfo(authToken: string): Promise<[nickname: string, profileUrl: string, userId: string, profileImage?:File]>{
    try {
      if (this.sdnClient!=null){
        var result=await this.sdnClient.getProfileInfo(this.userId)
      }else{
        return ["","",this.userId]
      }
      var nickname=result.displayname?result.displayname:""
      var profileUrl=result.avatar_url?result.avatar_url:""

      return [nickname,profileUrl,this.userId]
    } catch (error) {
      console.log("getProfileInfo err:",error)
      return ["","",this.userId]
    }
  }

  //message

  async sendTextMessage(authToken: string, recipientId:string, message: string): Promise<[messageId: string, status: string]>{
    try {
      if (this.sdnClient!=null){
        var res=await this.sdnClient.sendTextMessage(recipientId,message)
      }else{
        return ["","Need to log in first."]
      }
      return [res.event_id,"success"]
    } catch (error) {
      console.log("sendTextMessage err:",error)
      return ["","fail"]
    }
  }


  async sync(authToken: string, lastSynced:string, filter: Object): Promise<[messages: any, nextSync: string]>{
      const apiUrl = `${baseUrl}/_api/client/r0/sync`;

      const reqParam: SyncParams = lastSynced === ''
        ? { timeout: '0', 'dry-run': 'true' }
        : { timeout: '30000', since:lastSynced };

      const reqUrl = convertToQueryParams(apiUrl, reqParam);
      console.info(`sync reqUrl: ${reqUrl}`);

      try {
        const start = Date.now();
        const response = await axios.get(reqUrl, {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        });

        if (response.status !== 200) {
          console.error(`sync request failed, req_url: ${reqUrl}, http_code: ${response.status}`);
          if (response.status === 429) {
            await new Promise((resolve) => setTimeout(resolve, 30000)); // SyncTimeoutSecond equivalent
          }
          throw new Error(`http_code: ${response.status}`);
        }

        console.debug(`sync succeed, req_url: ${reqUrl}, elapse: ${Date.now() - start}ms`);

        console.log(`sync response: ${JSON.stringify(response.data)}`)
        return [response.data,response.data.next_batch];
      } catch (error) {
        console.error(`sync request failed, error: ${error}`);
        throw error;
      }
  }

  async processSync(syncResponse: any, authToken: string, userId: string, lastSynced: string): Promise<void> {
    console.log(`processSync start`)
    if (syncResponse.friend_request && Object.keys(syncResponse.friend_request).length > 0) {
      for (const [_, request] of Object.entries(syncResponse.friend_request)as [string, any][]) {
        await this.processFriendRequest(request.id, authToken);
      }
    }

    if (syncResponse.rooms?.join) {
        for (const roomId in syncResponse.rooms.join) {
            const roomData = syncResponse.rooms.join[roomId];
            if (roomData.state) {
                for (const event of roomData.state.events) {
                    await this.handleRoomEvent(event, roomId, authToken, userId, lastSynced);
                }
            }
            if (roomData.timeline) {
                for (const event of roomData.timeline.events) {
                    await this.handleRoomEvent(event, roomId, authToken, userId, lastSynced);
                }
            }
        }
    }
}

async processFriendRequest(requestId: string, authToken: string): Promise<void> {
    const url = `${baseUrl}/_api/client/r0/relation/friends/${requestId}/accept`;
    try {
        const response = await axios.put(url, {}, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (response.status === 200) {
            console.info(`Friend request ${requestId} accepted successfully.`);
        } else {
            console.error(`Failed to accept friend request ${requestId}, status: ${response.status}`);
        }
    } catch (error) {
        console.error(`Error accepting friend request ${requestId}: `,error);
    }
}

async handleRoomEvent(event: any, roomId: string, authToken: string, userId: string, lastSynced: string): Promise<void> {
    switch (event.type) {
        case "m.room.member":
            await this.handleMembership(event, roomId, authToken, userId, lastSynced);
            break;
        case "m.room.create":
            // await this.handleCreateRoom(event, roomId, authToken, lastSynced);
            break;
        case "m.room.message":
            await this.processMessage(event, roomId, authToken, userId, lastSynced);
            break;
        case "m.room.encrypted":
            // await this.processEncryptedMessage(event, roomId, authToken, userId, lastSynced);
            break;
        default:
            console.warn(`Unhandled event type: ${event.type}`);
    }
}

async processMessage(event: any, roomId: string, authToken: string, userId: string, lastSynced: string): Promise<void> {
  if (event.sender === userId) {
      console.info("Message from self or excluded user, ignoring.");
      return;
  }

  const content = event.content;
  if (content.msgtype === "m.text") {
      console.info(`Processing message in room ${roomId}: ${content.body}`);
      const responseBody = this.onMessage(content.body, roomId, event.sender);
      if (responseBody) {
          await this.sendHtmlMessage(responseBody, roomId, authToken);
      }
  }
}

async sendHtmlMessage(body: string, roomId: string, authToken: string): Promise<void> {
  const url = `${baseUrl}/_api/client/r0/rooms/${roomId}/send/m.room.message/${Date.now()}`;
  const message = {
      msgtype: "m.text",
      body: body,
      format: "org.matrix.custom.html",
      formatted_body: body,
  };
  try {
      const response = await axios.put(url, message, {
          headers: { Authorization: `Bearer ${authToken}` },
      });
      console.info(`Message sent successfully to room ${roomId}`);
  } catch (error) {
      console.error(`Failed to send message to room ${roomId}: `,error);
  }
}

async handleMembership(event: any, roomId: string, authToken: string, userId: string, lastSynced: string): Promise<void> {
  const membership = event.content.membership;
  if (membership === "invite") {
      await this.joinRoom(authToken,roomId);
  } else if (membership === "join") {
      console.info(`User joined room: ${roomId}`);
      // await this.sendWelcomeMessage(roomId, authToken);
  } else if (membership === "leave") {
      console.info(`User left room: ${roomId}`);
  }
}

  async getHistoryMessage(authToken: string, roomId:string, lastLocation: string): Promise<[messages: Array<string>, status: string,nextLocation: string]>{
    return [[],"",""]
  }
  async joinRoom(authToken: string, roomId:string): Promise<[status: string]>{
    try {
      if (this.sdnClient!=null){
        await this.sdnClient.joinRoom(roomId)
      }else{
        return ["fail"]
      }
      return ["success"]
    } catch (error) {
      console.log("joinRoom err:",error)
      return ["fail"]
    }
  }
  async leaveRoom(authToken: string, roomId:string): Promise<[status: string]>{
    try {
      if (this.sdnClient!=null){
        await this.sdnClient.leave(roomId)
      }else{
        return ["fail"]
      }
      return ["success"]
    } catch (error) {
      console.log("leaveRoom err:",error)
      return ["fail"]
    }
  }
}
export default SendingNetworkClient;

const convertToQueryParams = (reqUrl: string, params: SyncParams): string => {
  const url = new URL(reqUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
};