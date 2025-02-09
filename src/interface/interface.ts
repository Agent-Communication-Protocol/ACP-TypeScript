import { AuthenticationAPI } from './authentication/authentication-api';
import { UserAPI } from './user/user-api';
import { MessageAPI } from './message/message-api';

export interface AgentCommunication extends AuthenticationAPI, UserAPI, MessageAPI {}

export type onMessageType = (command: string, roomId: string, senderId: string) => string;
