function logError(context, error) {
	const code = error && (error.code || error.name);
	console.error(`${context} failed: ${typeof code === 'string' ? code : 'unknown error'}`);
}

module.exports = logError;
