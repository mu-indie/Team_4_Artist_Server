require('dotenv').config({ quiet: true });

const API = process.env.API || 'http://127.0.0.1:5001';
const KEY = process.env.KEY || process.env.API_KEY_DEVELOPMENT;
const N = Number(process.env.N ?? 60);

const mix = [
	{ path: '/', key: true },
	{ path: '/', key: true },
	{ path: '/', key: true },
	{ path: '/', key: true },
	{ path: '/api/artists/9223372036854775807', key: true },
	{ path: '/api/songs/9223372036854775807', key: true },
	{ path: '/', key: false },
	{ path: '/__monitoring_not_found__', key: true },
];

async function main() {
	const apiUrl = new URL(API);
	if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.pathname !== '/' ||
		apiUrl.search || apiUrl.hash || apiUrl.username || apiUrl.password) {
		throw new Error('API must be an HTTP(S) origin without a path, credentials, query, or fragment.');
	}
	if (!KEY) throw new Error('Set KEY or API_KEY_DEVELOPMENT to a valid API key.');
	if (!Number.isSafeInteger(N) || N < 1) throw new Error('N must be a positive integer.');

	const counts = {};
	for (let request = 0; request < N; request += 1) {
		const item = mix[Math.floor(Math.random() * mix.length)];
		const headers = item.key ? { 'X-API-Key': KEY } : {};
		const response = await fetch(new URL(item.path, apiUrl), { headers });
		counts[response.status] = (counts[response.status] || 0) + 1;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	console.log(JSON.stringify({ requests: N, statusCounts: counts }, null, 2));
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
