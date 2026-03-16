import { log, getArgs } from "./common.mjs";
import { sshConnect, sshDisconnect } from "./remote.mjs";

// Connection pool storage
const connectionPool = new Map();

// Debug helper for pool operations
const debugLog = (message, data = null) => {
  if (getArgs().debug) {
    if (data) {
      log.info(`🔍 ${message}`, data);
    } else {
      log.info(`🔍 ${message}`);
    }
  }
};

// Get or create SSH connection from pool
export const getPooledConnection = async (env) => {
  if (env === 'local') return null;

  const poolKey = `ssh_${env}`;

  if (connectionPool.has(poolKey)) {
    const conn = connectionPool.get(poolKey);
    debugLog(`Reusing pooled connection for ${env}`, { poolKey });
    return conn;
  }

  debugLog(`Creating new pooled connection for ${env}`, { poolKey });
  const conn = await sshConnect(env);
  connectionPool.set(poolKey, conn);
  return conn;
};

// Release connection back to pool (keep alive) or close it
export const releaseConnection = async (env, conn, forceClose = false) => {
  if (!conn || env === 'local') return;

  const poolKey = `ssh_${env}`;

  if (forceClose) {
    debugLog(`Force closing connection for ${env}`, { poolKey });
    connectionPool.delete(poolKey);
    await sshDisconnect(conn);
  } else {
    debugLog(`Keeping connection alive in pool for ${env}`, { poolKey });
    // Connection stays in pool for reuse
  }
};

// Close all pooled connections
export const closeAllConnections = async () => {
  debugLog(`Closing all pooled connections`, { count: connectionPool.size });

  for (const [poolKey, conn] of connectionPool.entries()) {
    try {
      await sshDisconnect(conn);
      debugLog(`Closed connection: ${poolKey}`);
    } catch (error) {
      log.warn(`Failed to close connection ${poolKey}: ${error.message}`);
    }
  }

  connectionPool.clear();
};
