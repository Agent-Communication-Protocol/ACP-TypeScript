export interface UserAPI {
    setNickname(authToken: string, nickname: string): Promise<[status: string, message: string]>;
    setProfileImage(authToken: string, image: string, imageUrl: string): Promise<[status: string, message: string]>;
    getProfileInfo(authToken: string): Promise<[nickname: string, profileUrl: string, userId: string, profileImage?:File]>;
}