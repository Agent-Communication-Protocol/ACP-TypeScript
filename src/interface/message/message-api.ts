export interface MessageAPI {
    sendTextMessage(authToken: string, recipientId:string, message: string): Promise<[messageId: string, status: string]>;
    sync(authToken: string, lastSynced:string, filter: Object): Promise<[messages: any, nextSync: string]>;
    getHistoryMessage(authToken: string, roomId:string, lastLocation: string): Promise<[messages: Array<string>, status: string,nextLocation: string]>;
    joinRoom(authToken: string, roomId:string): Promise<[status: string]>;
    leaveRoom(authToken: string, roomId:string): Promise<[status: string]>;
}