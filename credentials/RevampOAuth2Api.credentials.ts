import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class RevampOAuth2Api implements ICredentialType {
	name = 'revampOAuth2Api';
	extends = ['oAuth2Api'];
	displayName = 'Revamp OAuth2 API';
	documentationUrl = 'https://github.com/RevampOrg/n8n-nodes-revamp#credentials';
	icon = 'file:../nodes/Revamp/revamp.svg' as const;
	properties: INodeProperties[] = [
		{
			displayName: 'Use Dynamic Client Registration',
			name: 'useDynamicClientRegistration',
			type: 'hidden',
			default: true,
		},
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'hidden',
			default: 'https://app.revamp.dev/mcp',
		},
		{
			displayName: 'Resource URL',
			name: 'resourceUrl',
			type: 'hidden',
			default: 'https://app.revamp.dev/mcp',
		},
		{
			displayName: 'Allowed HTTP Request Domains',
			name: 'allowedHttpRequestDomains',
			type: 'hidden',
			default: 'domains',
		},
		{
			displayName: 'Allowed Domains',
			name: 'allowedDomains',
			type: 'hidden',
			default: 'app.revamp.dev',
		},
	];
	test: ICredentialTestRequest = {
		request: { method: 'GET', baseURL: 'https://app.revamp.dev', url: '/api/auth/mcp/userinfo' },
	};
}
