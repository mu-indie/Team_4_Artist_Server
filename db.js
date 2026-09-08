const mysql = require('mysql2');
require('dotenv').config();

const requiredConfig = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingConfig = requiredConfig.filter((key) => !process.env[key]);

if (missingConfig.length > 0) {
	throw new Error(`Missing database configuration: ${missingConfig.join(', ')}`);
}

const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD || '',
	database: process.env.DB_NAME,
	port: Number(process.env.DB_PORT) || 3306,
	waitForConnections: true,
	connectionLimit: 10,
});

module.exports = pool.promise();
