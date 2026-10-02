const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Revamp, requestId } = require('../dist/nodes/Revamp/Revamp.node');
const { RevampOAuth2Api } = require('../dist/credentials/RevampOAuth2Api.credentials');
const projectId = 'f3d1b2a0-a945-481b-9c6b-0a490f103462';
const submitted = {
	projectId,
	projectName: 'Website',
	submissionId: 'submission-1',
	status: 'pending',
	studioUrl: `https://app.revamp.dev/studio/${projectId}`,
};
function envelope(data) {
	return { jsonrpc: '2.0', id: 1, result: { structuredContent: data } };
}

// Wiring fixture for the compiled n8n node/helper boundary, not an n8n runtime.
async function run(
	rows,
	response = envelope(submitted),
	continueOnFail = false,
	account = 'customer-a',
) {
	const calls = [];
	const context = {
		getInputData: () => rows.map(() => ({ json: {} })),
		getNodeParameter: (key, index, fallback) => rows[index][key] ?? fallback,
		getNode: () => ({
			name: 'Revamp',
			type: 'n8n-nodes-revamp.revamp',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async function (type, options) {
				assert.equal(this, context);
				assert.equal(type, 'revampOAuth2Api');
				assert.equal(options.disableFollowRedirect, true);
				calls.push(options);
				if (options.method === 'GET') return { sub: account };
				return typeof response === 'function' ? response(options) : response;
			},
		},
	};
	try {
		return { output: await new Revamp().execute.call(context), calls };
	} catch (error) {
		error.calls = calls;
		throw error;
	}
}
const creation = {
	operation: 'createWebsite',
	name: 'Website',
	brief: 'Create a one-page website.',
	requestReference: 'crm-17',
};

test('creation maps quoted multiline input and account-bound request references through the authenticated helper', async () => {
	const brief = 'Create a website.\nUse a "blue" button.';
	const result = await run([
		{ ...creation, brief },
		{ ...creation, requestReference: 'crm-18', clientId: 'agency-folder' },
	]);
	assert.equal(result.calls.filter((call) => call.method === 'GET').length, 1);
	const requests = result.calls.filter((call) => call.method === 'POST');
	assert.equal(requests[0].url, 'https://app.revamp.dev/api/make/mcp');
	assert.deepEqual(requests[0].body.params, {
		name: 'start_new_website',
		arguments: {
			name: 'Website',
			brief,
			requestId: requestId('customer-a', 'createWebsite', 'crm-17'),
		},
	});
	assert.equal(requests[1].body.params.arguments.clientId, 'agency-folder');
	assert.notEqual(
		requests[0].body.params.arguments.requestId,
		requests[1].body.params.arguments.requestId,
	);
	assert.deepEqual(
		result.output[0].map((item) => item.pairedItem),
		[{ item: 0 }, { item: 1 }],
	);
	const retry = await run([{ ...creation, brief }]);
	assert.deepEqual(retry.calls[1].body, requests[0].body);
});

test('reference namespaces are stable, unambiguous UUIDv8 and separate accounts and actions', () => {
	const id = requestId('a', 'createWebsite', 'x');
	assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
	assert.equal(id, requestId('a', 'createWebsite', 'x'));
	assert.notEqual(id, requestId('b', 'createWebsite', 'x'));
	assert.notEqual(id, requestId('a', 'redesignWebsite', 'x'));
	assert.notEqual(requestId('a:b', 'c', 'x'), requestId('a', 'b:c', 'x'));
});

test('redesign omits empty optional instructions and maps the public URL', async () => {
	const { calls } = await run([
		{
			operation: 'redesignWebsite',
			name: 'New look',
			requestReference: 'lead-1',
			url: 'https://example.com/',
		},
	]);
	assert.equal(calls[1].body.params.name, 'start_website_redesign');
	assert.equal(calls[1].body.params.arguments.url, 'https://example.com/');
	assert.equal('brief' in calls[1].body.params.arguments, false);
});

test('status follows the specific submission and preserves unknown status and absent previews', async () => {
	const data = {
		projectId,
		projectName: 'Website',
		studioUrl: submitted.studioUrl,
		status: null,
		reply: null,
		previewUrl: null,
	};
	const { output, calls } = await run(
		[{ operation: 'checkProject', projectId, submissionId: 'missing' }],
		envelope(data),
	);
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].body.params.arguments, { projectId, submissionId: 'missing' });
	assert.deepEqual(output[0][0].json, data);
});

test('validation rejects unsupported operations, blank requests, overlong instructions and missing submission IDs', async () => {
	for (const input of [
		{ ...creation, operation: 'delete' },
		{ ...creation, requestReference: '' },
		{ ...creation, brief: 'x'.repeat(2001) },
		{ operation: 'checkProject', projectId },
	]) {
		await assert.rejects(run([input]), (error) => error.calls.length === 0);
	}
});

test('HTTP 200 tool errors are failed executions with customer-facing explanations', async () => {
	await assert.rejects(
		run([creation], {
			jsonrpc: '2.0',
			id: 1,
			result: { isError: true, content: [{ type: 'text', text: 'You need more Revamp credits.' }] },
		}),
		/You need more Revamp credits/,
	);
	for (const response of [
		{ jsonrpc: '2.0', id: 2, result: {} },
		{ jsonrpc: '2.0', id: 1, error: { message: 'private implementation detail' } },
		envelope({ ...submitted, status: undefined }),
	]) {
		await assert.rejects(
			run([creation], response),
			(error) => !error.message.includes('private implementation detail'),
		);
	}
});

test('continue-on-fail preserves pairing without mutating or duplicating inputs', async () => {
	const { output } = await run([{ ...creation, brief: '' }, creation], envelope(submitted), true);
	assert.equal(output[0].length, 2);
	assert.equal(typeof output[0][0].json.error, 'string');
	assert.equal(output[0][1].json.projectId, projectId);
	assert.deepEqual(
		output[0].map((item) => item.pairedItem),
		[{ item: 0 }, { item: 1 }],
	);
});

test('transport failures never expose credentials or raw response details in error bundles', async () => {
	const { output } = await run(
		[creation],
		() => {
			throw new Error('Authorization: Bearer PRIVATE_TOKEN private upstream trace');
		},
		true,
	);
	assert.doesNotMatch(JSON.stringify(output), /PRIVATE_TOKEN|private upstream trace/);
});

test('native OAuth discovery is fixed to Revamp and does not embed developer credentials', () => {
	const credential = new RevampOAuth2Api();
	assert.deepEqual(credential.extends, ['oAuth2Api']);
	const properties = Object.fromEntries(
		credential.properties.map((property) => [property.name, property.default]),
	);
	assert.equal(properties.useDynamicClientRegistration, true);
	assert.equal(properties.serverUrl, 'https://app.revamp.dev/mcp');
	assert.equal(properties.resourceUrl, properties.serverUrl);
	assert.equal(properties.allowedDomains, 'app.revamp.dev');
	assert.equal('clientSecret' in properties, false);
});
