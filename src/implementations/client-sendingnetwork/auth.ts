import sdk from 'sendingnetwork-js-sdk';

export class SendingNetworkAuth {
    /**
     * Creates a new SendingNetworkAuth class for creating a SDNClient
     * @param {string} nodeUrl The node URL to authenticate against.
     */
    public constructor(private nodeUrl: string) {
        // nothing to do
    }

    /**
     * Generate a client with no access token so we can reuse the request
     * logic already written.
     */
    private createTemplateClient(): any {
        return sdk.createClient({baseUrl: this.nodeUrl});
    }

    public async didPreLogin(address: string, deviceId: string): Promise<any> {
        const body = {device_id: deviceId,did:"",address:""}
        let response: any
        try {
            let tmpClient = this.createTemplateClient()
            console.log(tmpClient.baseUrl)
            let queryDidResp = await tmpClient.http.request(undefined, "GET", "/_api/client/v3/address/" + address, null, null, {
                prefix: ''
            });
            console.log("queryDidResp: ", queryDidResp)
            if (queryDidResp["data"].length > 0) {
                body["did"] = queryDidResp["data"][0]
            } else {
                body["address"] = address
            }
            response = await tmpClient.http.request(undefined, "POST", "/_api/client/v3/did/pre_login1", null, body, {
                prefix: ''
            });
        } catch (e) {
            throw e
        }
        if (!response) throw new Error("didPreLogin fail");
        return response
    }

    public async didLogin(address: string, did: string, message: string, token: string, nonce: string, update_time: string): Promise<any> {
        return await this.didLoginWithAppToken(address, did, message, token, "", nonce, update_time)
    }

    public async didLoginWithAppToken(address: string, did: string, message: string, token: string, appToken: string, nonce: string, update_time: string): Promise<any> {
        const body = {
            "identifier": {
                "did": did,
                "address": address,
                "message": message,
                "token": token,
                "app_token": appToken
            },
            "type": "m.login.did.identity",
            "random_server": nonce,
            "updated": update_time,
        }
        let response: any
        try {
            response = await this.createTemplateClient().http.request(undefined, "POST", "/_api/client/unstable/did/login", null, body, {
                prefix: ''
            });
        } catch (e) {
            throw e
        }
        if (!response) throw new Error("didLogin fail");
        return response
    }
}
