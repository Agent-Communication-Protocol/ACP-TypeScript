import { MessagingPlatform } from '../platform/platform';
import { onMessageType } from '../interface/interface';
import { SendingNetworkClient } from '../implementations/client-sendingnetwork/client-sendingnetwork';
export class ACPFactory {
    static createClient(platform: MessagingPlatform, onMsg: onMessageType) {
        switch (platform) {
        case MessagingPlatform.SendingNetwork:
            return new SendingNetworkClient(onMsg);

        default:
            throw new Error(`Unsupported platform: ${platform}`);
        }
    }
}


