const mysql = require('mysql2/promise');
require('dotenv').config();

// Validate required environment variables
if (!process.env.DB_HOST) {
    throw new Error('DB_HOST environment variable is required');
}
if (!process.env.DB_USER) {
    throw new Error('DB_USER environment variable is required');
}
if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD environment variable is required');
}
if (!process.env.DB_NAME) {
    throw new Error('DB_NAME environment variable is required');
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

module.exports = pool;
