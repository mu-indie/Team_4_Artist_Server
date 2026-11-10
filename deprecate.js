const SUNSET_DATE = 'Tue, 10 Nov 2026 00:00:00 GMT';

function successorUrl(req) {
	const rawUrl = req.originalUrl || req.url || '';
	const [pathname, ...queryParts] = rawUrl.split('?');
	const queryString = queryParts.length ? `?${queryParts.join('?')}` : '';
	let targetPath = pathname || '/';

	if (targetPath === '/v1' || targetPath === '/v1/') {
		return `/v2${queryString}`;
	}
	if (targetPath.startsWith('/v1/')) {
		targetPath = targetPath.slice('/v1'.length);
	}

	if (targetPath.startsWith('/api/')) {
		return `/v2${targetPath}${queryString}`;
	}
	if (targetPath.startsWith('/artists')) {
		return `/v2/api/artists${targetPath.slice('/artists'.length)}${queryString}`;
	}
	if (targetPath.startsWith('/bookings')) {
		return `/v2/api/bookings${targetPath.slice('/bookings'.length)}${queryString}`;
	}
	if (targetPath.startsWith('/venues')) {
		return `/v2/api/venues${targetPath.slice('/venues'.length)}${queryString}`;
	}
	if (targetPath === '/') {
		return `/v2${queryString}`;
	}

	return `/v2${targetPath}${queryString}`;
}

function deprecate(req, res, next) {
	res.setHeader('Deprecation', 'true');
	res.setHeader('Sunset', SUNSET_DATE);
	res.setHeader('Link', `<${successorUrl(req)}>; rel="successor-version"`);
	next();
}

module.exports = deprecate;
module.exports.SUNSET_DATE = SUNSET_DATE;
