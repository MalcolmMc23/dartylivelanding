// NOTE: This file is no longer used as the application has been switched to in-memory storage only.
// It's kept for reference in case database functionality needs to be restored in the future.

// Mock implementations that return errors if accidentally called
const mockPool = {
  connect: async () => {
    throw new Error('Database connection has been disabled. Application is using in-memory storage only.');
  },
  query: async () => {
    throw new Error('Database queries have been disabled. Application is using in-memory storage only.');
  },
  end: async () => {
    return;
  }
};

// Mock test connection that always returns false
async function mockTestConnection() {
  console.warn('Database connection test called but database has been disabled.');
  return false;
}

// Mock query function that throws an error
async function mockQuery() {
  throw new Error('Database queries have been disabled. Application is using in-memory storage only.');
}

// Export mock implementations
const dbUtils = { 
  query: mockQuery, 
  pool: mockPool, 
  testConnection: mockTestConnection 
};

export default dbUtils;