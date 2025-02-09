export interface AuthenticationAPI {
    register(address: string): Promise<[userId: string, status: string]>;
    getChallenge(address: string): Promise<[challenge: string, challengeId: string, expiresAt: string]>;
    returnSignature(challengeId: string, signature: string): Promise<[userId: string, status: string, message: string]>;
    login(address: string, key?: string, deviceId?: string): Promise<[authToken: string, userId: string, status: string]>;
}