/**
 * Injectable fetch mock for AS Adventurer API characterization tests.
 *
 * Pass `mockFetch` to createApp(). There is deliberately no global
 * installer: a global seam ships in the built binary and lets anything
 * loaded earlier intercept requests carrying the user's API keys.
 */

const calls = [];
let nextResponse = null;
let nextError = null;

function createResponse({ status = 200, body = '{}', headers = {} } = {}) {
    const textBody = typeof body === 'string' ? body : JSON.stringify(body);
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: {
            get: (name) => headers[name.toLowerCase()] || headers[name] || null
        },
        text: async () => textBody,
        json: async () => JSON.parse(textBody)
    };
}

async function mockFetch(url, options = {}) {
    calls.push({ url, options, method: options.method || 'GET' });

    if (nextError) {
        const err = nextError;
        nextError = null;
        throw err;
    }

    const response = nextResponse || createResponse();
    nextResponse = null;
    return response;
}

function resetMockFetch() {
    calls.length = 0;
    nextResponse = null;
    nextError = null;
}

function mockFetchResponse(status, body, headers) {
    nextResponse = createResponse({ status, body, headers });
}

function mockFetchReject(message) {
    nextError = new Error(message);
}

function getFetchCalls() {
    return calls.slice();
}

function wasFetchCalled() {
    return calls.length > 0;
}

/**
 * Read form-data body buffer when present (node form-data package).
 */
async function getFormBodyString(body) {
    if (!body) return '';
    if (typeof body === 'string') return body;
    if (Buffer.isBuffer(body)) return body.toString('binary');
    if (typeof body.getBuffer === 'function') {
        return body.getBuffer().toString('binary');
    }
    if (typeof body.on === 'function') {
        const chunks = [];
        return await new Promise((resolve, reject) => {
            body.on('data', (c) => chunks.push(Buffer.from(c)));
            body.on('end', () => resolve(Buffer.concat(chunks).toString('binary')));
            body.on('error', reject);
        });
    }
    return String(body);
}

module.exports = {
    resetMockFetch,
    mockFetchResponse,
    mockFetchReject,
    getFetchCalls,
    wasFetchCalled,
    getFormBodyString,
    createResponse,
    mockFetch
};
