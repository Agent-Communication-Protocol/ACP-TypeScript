import sdk from 'sendingnetwork-js-sdk'
import { SendingNetworkAuth } from './auth'
import Web3 from 'web3'
import axios from 'axios';
import {
	composeContext,
	Content,
	elizaLogger,
	Memory,
	ModelClass,
	stringToUuid,
	messageCompletionFooter,
	generateMessageResponse,
	Client,
	IAgentRuntime,
} from "@elizaos/core";
import { messageHandlerTemplate } from './templates';

interface SyncParams {
	timeout: string;
	since?: string;
	'dry-run'?: string;
}

const baseUrl = 'https://portal0101.sending.network'

export class AcpClient {
	private runtime: IAgentRuntime;
	private sdnClient: sdk.SendingNetworkClient;
	private accessToken: string
	private userId: string

	constructor(runtime: IAgentRuntime) {
		this.runtime = runtime;
		this.login()
	}

	async login() {
		const auth = new SendingNetworkAuth(baseUrl),
			address = process.env.ACP_CONFIG_WALLET_ADDRESS,
			web3 = new Web3(),
			keyBytes = web3.utils.hexToBytes(process.env.ACP_CONFIG_WALLET_PRIVATE_KEY)

		try {
			let loginMessage = await auth.didPreLogin(address, `aiAgent`),
				walletSignature = web3.eth.accounts.sign(loginMessage["message"], keyBytes),
				loginResp = await auth.didLogin(address,
					loginMessage["did"], loginMessage["message"], walletSignature["signature"],
					loginMessage["random_server"], loginMessage["updated"]
				)
			this.sdnClient = sdk.createClient({
				baseUrl: baseUrl,
				accessToken: loginResp["access_token"],
				userId: loginResp["user_id"]
			})
			this.accessToken = loginResp["access_token"];
			this.userId = loginResp["user_id"];
			this.pollMessages()
		} catch (error) {
			console.log("login err:", error)
		}
	}

	async pollMessages () {
		var next=""
    while(1){
			var resp=await this.sync(next)
			await this.processSync(resp[0], this.accessToken, this.userId, next)
			next=resp[1]
    }
	}

	async sync(lastSynced: string): Promise<[messages: any, nextSync: string]> {
		const apiUrl = `${baseUrl}/_api/client/r0/sync`;

		const reqParam: SyncParams = lastSynced === ''
			? { timeout: '0', 'dry-run': 'true' }
			: { timeout: '30000', since: lastSynced };

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
			return [response.data, response.data.next_batch];
		} catch (error) {
			console.error(`sync request failed, error: ${error}`);
			throw error;
		}
	}

	async processSync(syncResponse: any, authToken: string, userId: string, lastSynced: string): Promise<void> {
		console.log(`processSync start`)
		if (syncResponse.friend_request && Object.keys(syncResponse.friend_request).length > 0) {
			for (const [_, request] of Object.entries(syncResponse.friend_request) as [string, any][]) {
				await this.processFriendRequest(request, authToken);
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

	async processFriendRequest(request: any, authToken: string): Promise<void> {
		const requestId = request.id;
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
			console.log(`Friend request ${request.user_id} accepted successfully.`);
		} catch (error) {
			console.error(`Error accepting friend request ${requestId}: `, error);
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

	async handleMembership(event: any, roomId: string, authToken: string, userId: string, lastSynced: string): Promise<void> {
		const membership = event.content.membership;
		if (membership === "invite") {
				await this.joinRoom(authToken,roomId);
				// await this.sendWelcomeMessage(roomId, authToken);
		} else if (membership === "join") {
				console.info(`User joined room: ${roomId}`);
				// await this.sendWelcomeMessage(roomId, authToken);
		} else if (membership === "leave") {
				console.info(`User left room: ${roomId}`);
		}
	}

	async joinRoom(roomId: string, authToken: string): Promise<[status: string]> {
    const url = `${baseUrl}/_api/client/r0/join/${roomId}`;
    try {
        const response = await axios.post(url, {}, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        console.info(`Successfully joined room ${roomId}`);
        return ["success"]
    } catch (error) {
        console.error(`Failed to join room ${roomId}: `, error);
        return ["fail"]
    }
	}

	async createRoom(authToken: string, invitees: string[], roomName: string): Promise<void> {
		const url = `${baseUrl}/_api/client/r0/createRoom?access_token=${authToken}`;
	
		const requestData = {
				preset: "public_chat",
				invite: invitees,
				name: roomName,
		};
	
		try {
				const response = await axios.post(url, requestData, {
						headers: {
								"Content-Type": "application/json",
						},
				});
	
				if (response.status === 200) {
						console.info(`Room "${roomName}" created successfully with room ID: ${response.data.room_id}`);
				} else {
						console.error(`Failed to create room "${roomName}", status: ${response.status}`);
				}
		} catch (error) {
				console.error(`Error creating room "${roomName}": `, error);
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
				const responseBody = await this.getMessageResponse(content.body, roomId);
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
	
	async getMessageResponse(question: string, roomId: string): Promise<string> {
		const content: Content = {
			text: question
		};
		const memory = {
			content,
			roomId: stringToUuid(roomId),
			agentId: this.runtime.agentId,
			userId: this.runtime.agentId,
		};
		await this.runtime.messageManager.createMemory(memory);
		let state = await this.runtime.composeState(memory);
		state = await this.runtime.updateRecentMessageState(state);
		const context = composeContext({
			state,
			template: messageHandlerTemplate
		});
		const response = await generateMessageResponse({
			runtime: this.runtime,
			context,
			modelClass: ModelClass.LARGE
		});
		if (!response) {
			console.error("\u274C No response from generateMessageResponse");
			return ``;
		}
		return response.text
	}
}

function convertToQueryParams(reqUrl: string, params: SyncParams): string {
	const url = new URL(reqUrl);
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url.toString();
};



export const AcpClientInterface: Client = {
	start: async (runtime: IAgentRuntime) => {
		const client = new AcpClient(runtime);
		return client;
	},
	stop: async (_runtime: IAgentRuntime) => {
		console.warn("Acp client does not support stopping yet");
	},
};

export default AcpClientInterface;
