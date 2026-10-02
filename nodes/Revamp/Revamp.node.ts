import { createHash } from 'crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const credentialType = 'revampOAuth2Api';
const baseUrl = 'https://app.revamp.dev';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function object(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(
	context: IExecuteFunctions,
	name: string,
	index: number,
	max: number,
	required = true,
): string {
	const value = context.getNodeParameter(name, index, '');
	if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
		const labels: Record<string, string> = {
			name: 'Website Name',
			brief: 'Instructions',
			url: 'Website URL',
			requestReference: 'Request Reference',
			clientId: 'Client Folder ID',
			projectId: 'Project ID',
			submissionId: 'Submission ID',
		};
		const label = labels[name] ?? name;
		throw new NodeOperationError(
			context.getNode(),
			`Please provide a valid ${label} (up to ${max} characters).`,
			{ itemIndex: index },
		);
	}
	return value.trim();
}

// Account and operation namespaces prevent unrelated workflows sharing a reference.
export function requestId(account: string, operation: string, reference: string): string {
	const hash = createHash('sha256')
		.update(JSON.stringify(['revamp:n8n:v1', account, operation, reference]))
		.digest('hex');
	return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function output(
	context: IExecuteFunctions,
	response: unknown,
	operation: string,
	index: number,
): IDataObject {
	const fail = (message: string): never => {
		throw new NodeOperationError(context.getNode(), message, { itemIndex: index });
	};
	if (!object(response) || response.jsonrpc !== '2.0' || response.id !== 1)
		return fail('Revamp returned an unexpected response.');
	if (response.error)
		return fail('Revamp could not accept this request. Check the selected action and inputs.');
	const result = response.result;
	if (!object(result)) return fail('Revamp returned an unexpected response.');
	if (result.isError) {
		const content = result.content;
		const part = Array.isArray(content)
			? content.find(
					(value) => object(value) && value.type === 'text' && typeof value.text === 'string',
				)
			: undefined;
		return fail(
			object(part) && typeof part.text === 'string'
				? part.text
				: 'Revamp could not complete this request.',
		);
	}
	const data = result.structuredContent;
	if (
		!object(data) ||
		typeof data.projectId !== 'string' ||
		!uuid.test(data.projectId) ||
		typeof data.projectName !== 'string' ||
		typeof data.studioUrl !== 'string' ||
		!data.studioUrl.startsWith(`${baseUrl}/studio/`)
	) {
		return fail(
			'Revamp returned incomplete project details. Check progress before starting another request.',
		);
	}
	if (operation === 'checkProject') {
		if (
			!(data.status === null || typeof data.status === 'string') ||
			!(data.reply === null || typeof data.reply === 'string') ||
			!(data.previewUrl === null || typeof data.previewUrl === 'string')
		)
			return fail('Revamp returned incomplete progress details.');
	} else if (
		typeof data.submissionId !== 'string' ||
		!data.submissionId ||
		typeof data.status !== 'string'
	) {
		return fail(
			'Revamp returned incomplete request details. Retry with the same request reference.',
		);
	}
	return data;
}

export class Revamp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Revamp',
		name: 'revamp',
		icon: { light: 'file:revamp.svg', dark: 'file:revamp.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Create or redesign websites and check their progress',
		defaults: { name: 'Revamp' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: credentialType, required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'createWebsite',
				options: [
					{
						name: 'Check Project',
						value: 'checkProject',
						action: 'Check project progress',
						description: 'Get progress, the latest reply, and an available preview',
					},
					{
						name: 'Create Website',
						value: 'createWebsite',
						action: 'Create a website',
						description: 'Create a new website from your instructions',
					},
					{
						name: 'Redesign Website',
						value: 'redesignWebsite',
						action: 'Redesign a website',
						description: 'Redesign an existing public website',
					},
				],
			},
			{
				displayName:
					'Generation runs in the background. Save the project and submission IDs, then check progress in a later step. An available preview may be from an earlier request.',
				name: 'progressNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Website Name',
				name: 'name',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Meridian Advisory',
				description: 'Name for the new Revamp project',
				displayOptions: { show: { operation: ['createWebsite', 'redesignWebsite'] } },
			},
			{
				displayName: 'Instructions',
				name: 'brief',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				placeholder: 'Create a modern one-page website for my advisory firm.',
				description: 'What you want the website to look like and do (up to 2,000 characters)',
				displayOptions: { show: { operation: ['createWebsite'] } },
			},
			{
				displayName: 'Website URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com',
				description: 'Public address of the website to redesign',
				displayOptions: { show: { operation: ['redesignWebsite'] } },
			},
			{
				displayName: 'Instructions',
				name: 'brief',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				placeholder: 'Give the website a modern design and clearer calls to action.',
				description: 'Optional redesign direction (up to 2,000 characters)',
				displayOptions: { show: { operation: ['redesignWebsite'] } },
			},
			{
				displayName: 'Request Reference',
				name: 'requestReference',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Source Record ID',
				description:
					'A unique reference from your source record. Keep it and the inputs unchanged when retrying; use a new reference for a new website.',
				displayOptions: { show: { operation: ['createWebsite', 'redesignWebsite'] } },
			},
			{
				displayName: 'Client Folder ID',
				name: 'clientId',
				type: 'string',
				default: '',
				description: 'Optional existing agency client folder for this project',
				displayOptions: { show: { operation: ['createWebsite', 'redesignWebsite'] } },
			},
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'string',
				default: '',
				required: true,
				placeholder: '={{ $json.projectId }}',
				description: 'Project ID returned by the creation or redesign action',
				displayOptions: { show: { operation: ['checkProject'] } },
			},
			{
				displayName: 'Submission ID',
				name: 'submissionId',
				type: 'string',
				default: '',
				required: true,
				placeholder: '={{ $json.submissionId }}',
				description: 'Submission ID of the specific request to follow',
				displayOptions: { show: { operation: ['checkProject'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const results: INodeExecutionData[] = [];
		let account: string | undefined;
		for (let index = 0; index < this.getInputData().length; index++) {
			try {
				const operation = this.getNodeParameter('operation', index) as string;
				let tool: string;
				let args: IDataObject;
				if (operation === 'checkProject') {
					const projectId = text(this, 'projectId', index, 36);
					if (!uuid.test(projectId))
						throw new NodeOperationError(
							this.getNode(),
							'Provide the project ID returned by Revamp.',
							{ itemIndex: index },
						);
					args = { projectId, submissionId: text(this, 'submissionId', index, 512) };
					tool = 'check_project';
				} else if (operation === 'createWebsite' || operation === 'redesignWebsite') {
					const name = text(this, 'name', index, 120);
					const brief = text(this, 'brief', index, 2000, operation === 'createWebsite');
					const reference = text(this, 'requestReference', index, 512);
					const clientId = text(this, 'clientId', index, 512, false);
					const url = operation === 'redesignWebsite' ? text(this, 'url', index, 2048) : undefined;
					if (!account) {
						const info = await this.helpers.httpRequestWithAuthentication.call(
							this,
							credentialType,
							{
								method: 'GET',
								url: `${baseUrl}/api/auth/mcp/userinfo`,
								json: true,
								disableFollowRedirect: true,
								timeout: 30000,
							},
						);
						if (!object(info) || typeof info.sub !== 'string' || !info.sub)
							throw new NodeOperationError(
								this.getNode(),
								'Reconnect your Revamp account before starting a website.',
								{ itemIndex: index },
							);
						account = info.sub;
					}
					args = {
						requestId: requestId(account, operation, reference),
						name,
						...(brief ? { brief } : {}),
						...(url ? { url } : {}),
						...(clientId ? { clientId } : {}),
					};
					tool = operation === 'createWebsite' ? 'start_new_website' : 'start_website_redesign';
				} else {
					throw new NodeOperationError(this.getNode(), 'Select a supported Revamp operation.', {
						itemIndex: index,
					});
				}
				// Existing authenticated JSON transport; generation and billing stay in Revamp.
				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					credentialType,
					{
						method: 'POST',
						url: `${baseUrl}/api/make/mcp`,
						json: true,
						disableFollowRedirect: true,
						timeout: 60000,
						headers: { Accept: 'application/json, text/event-stream' },
						body: {
							jsonrpc: '2.0',
							id: 1,
							method: 'tools/call',
							params: { name: tool, arguments: args },
						},
					},
				);
				results.push({
					json: output(this, response, operation, index),
					pairedItem: { item: index },
				});
			} catch (error) {
				// Never copy HTTP exception bodies, headers, or credentials into bundles.
				const message =
					error instanceof NodeOperationError
						? error.message
						: 'Revamp could not be reached. Check your connection; retry website requests with the same reference.';
				if (this.continueOnFail())
					results.push({ json: { error: message }, pairedItem: { item: index } });
				else throw new NodeOperationError(this.getNode(), message, { itemIndex: index });
			}
		}
		return [results];
	}
}
