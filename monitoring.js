const crypto = require('node:crypto');

const stats = {
	startedAt: new Date().toISOString(),
	total: 0,
	clientErrors: 0,
	serverErrors: 0,
	totalMs: 0,
	routes: {},
};

function newRoute() {
	return { count: 0, clientErrors: 0, serverErrors: 0, totalMs: 0, maxMs: 0 };
}

function roundMs(ms) {
	return Math.round(ms * 10) / 10;
}

function monitor(req, res, next) {
	const startedAt = process.hrtime.bigint();

	res.on('finish', () => {
		const ms = roundMs(Number(process.hrtime.bigint() - startedAt) / 1e6);
		const status = res.statusCode;
		const apiKey = req.consumerId && !req.browserClient ? req.get('X-API-Key') : undefined;
		const caller = apiKey
			? `key-${crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 6)}`
			: 'none';

		console.log(JSON.stringify({
			time: new Date().toISOString(),
			method: req.method,
			path: req.baseUrl + req.path,
			status,
			ms,
			caller,
		}));

		stats.total += 1;
		stats.totalMs += ms;
		if (status >= 400 && status < 500) stats.clientErrors += 1;
		if (status >= 500) stats.serverErrors += 1;

		const routePath = req.route ? req.baseUrl + req.route.path : '(no route)';
		const label = req.route ? `${req.method} ${routePath}` : `${req.method} (no route)`;
		const route = stats.routes[label] || (stats.routes[label] = newRoute());
		route.count += 1;
		route.totalMs += ms;
		route.maxMs = Math.max(route.maxMs, ms);
		if (status >= 400 && status < 500) route.clientErrors += 1;
		if (status >= 500) route.serverErrors += 1;
	});

	next();
}

function statsHandler(req, res) {
	const uptimeSeconds = roundMs((Date.now() - Date.parse(stats.startedAt)) / 1000);
	const routes = Object.fromEntries(
		Object.entries(stats.routes).map(([label, route]) => [
			label,
			{
				count: route.count,
				clientErrors: route.clientErrors,
				serverErrors: route.serverErrors,
				avgMs: roundMs(route.totalMs / route.count),
				maxMs: route.maxMs,
			},
		]),
	);

	res.json({
		startedAt: stats.startedAt,
		uptimeSeconds,
		total: stats.total,
		clientErrors: stats.clientErrors,
		serverErrors: stats.serverErrors,
		errorRatePercent: stats.total ? roundMs((stats.serverErrors / stats.total) * 100) : 0,
		avgMs: stats.total ? roundMs(stats.totalMs / stats.total) : 0,
		routes,
	});
}

module.exports = { monitor, statsHandler };
