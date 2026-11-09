const crypto = require('node:crypto');

const startedAtTime = Date.now();
const stats = {
	startedAt: new Date(startedAtTime).toISOString(),
	total: 0,
	clientErrors: 0,
	serverErrors: 0,
	totalMs: 0,
	routes: {},
};

function roundMs(value) {
	return Math.round(value * 10) / 10;
}

function newRoute() {
	return { count: 0, clientErrors: 0, serverErrors: 0, totalMs: 0, maxMs: 0 };
}

function monitor(req, res, next) {
	const started = process.hrtime.bigint();
	const path = req.path;

	res.on('finish', () => {
		const ms = roundMs(Number(process.hrtime.bigint() - started) / 1e6);
		const caller = req.apiKey
			? `key-${crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 6)}`
			: 'none';

		console.log(JSON.stringify({
			time: new Date().toISOString(),
			method: req.method,
			path,
			status: res.statusCode,
			ms,
			caller,
		}));

		const status = res.statusCode;
		const routeName = req.route
			? `${req.method} ${req.baseUrl + req.route.path}`
			: `${req.method} (no route)`;
		const route = stats.routes[routeName] || (stats.routes[routeName] = newRoute());

		stats.total += 1;
		stats.totalMs += ms;
		route.count += 1;
		route.totalMs += ms;
		route.maxMs = Math.max(route.maxMs, ms);
		if (status >= 400 && status < 500) {
			stats.clientErrors += 1;
			route.clientErrors += 1;
		} else if (status >= 500) {
			stats.serverErrors += 1;
			route.serverErrors += 1;
		}
	});

	next();
}

function statsHandler(req, res) {
	const routes = Object.fromEntries(Object.entries(stats.routes).map(([name, route]) => [
		name,
		{
			count: route.count,
			clientErrors: route.clientErrors,
			serverErrors: route.serverErrors,
			avgMs: route.count ? roundMs(route.totalMs / route.count) : 0,
			maxMs: route.maxMs,
		},
	]));

	res.json({
		startedAt: stats.startedAt,
		uptimeSeconds: roundMs((Date.now() - startedAtTime) / 1000),
		total: stats.total,
		clientErrors: stats.clientErrors,
		serverErrors: stats.serverErrors,
		errorRatePercent: stats.total ? roundMs((stats.serverErrors / stats.total) * 100) : 0,
		avgMs: stats.total ? roundMs(stats.totalMs / stats.total) : 0,
		routes,
	});
}

module.exports = { monitor, statsHandler };
